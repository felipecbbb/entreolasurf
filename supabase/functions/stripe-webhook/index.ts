import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function getBonoExpiry(classType: string): string {
  const days = ["grupal", "individual"].includes(classType) ? 180 : 365;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("No signature", { status: 400 });

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    if (session.payment_status !== "paid") {
      return new Response("Not paid yet", { status: 200 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const meta = session.metadata || {};
    const orderId = meta.orderId;
    const userId = meta.userId || null;
    // Una vez reclamado el pedido (pending→paid), un fallo posterior NO debe
    // devolver 500 (haría que Stripe reintente y, al estar ya 'paid', salte el
    // pedido dejándolo a medias). Se marca para reconciliación y se responde 200.
    let orderClaimed = false;

    if (!orderId || !userId) {
      console.error("Missing orderId or userId in metadata");
      return new Response("Missing metadata", { status: 400 });
    }

    try {
      // Fetch the pending order to get cart data
      const { data: pendingOrder, error: fetchErr } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .single();

      if (fetchErr || !pendingOrder) throw new Error("Order not found: " + orderId);

      // Parse cart and customer from notes
      const notes = pendingOrder.notes || "";
      let cart: any[] = [];
      let customer: any = {};

      const cartMatch = notes.match(/__cart__:(.*?)(?:\|__customer__|$)/);
      if (cartMatch) {
        try { cart = JSON.parse(cartMatch[1]); } catch { console.error("Failed to parse cart"); }
      }

      const custMatch = notes.match(/__customer__:(.*?)(?:\|stripe_session:|$)/);
      if (custMatch) {
        try { customer = JSON.parse(custMatch[1]); } catch {}
      }

      const totalPaid = (session.amount_total || 0) / 100;

      // Update order: mark as paid, clean up notes
      const finalNotes = [
        customer.notes || "",
        `Stripe: ${session.id}`,
        meta.couponCode ? `Cupon: ${meta.couponCode}` : "",
      ].filter(Boolean).join(" | ") || null;

      // IDEMPOTENCIA: reclama el pedido de forma atómica. Solo pasa de
      // 'pending' a 'paid' una vez; si el webhook se reintenta (Stripe
      // entrega "at least once"), el UPDATE no afecta filas y salimos sin
      // reprocesar (no se duplican bonos/inscripciones/stock/pagos/emails).
      const { data: claimed } = await supabase.from("orders")
        .update({ status: "paid", total: totalPaid, notes: finalNotes })
        .eq("id", orderId)
        .eq("status", "pending")
        .select("id");
      if (!claimed || claimed.length === 0) {
        console.log(`Order ${orderId} ya procesado — webhook duplicado, ignorado`);
        return new Response(JSON.stringify({ received: true, duplicate: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      orderClaimed = true;

      // Save address/phone to profile
      const profileUpdate: Record<string, any> = {};
      if (customer.phone) profileUpdate.phone = customer.phone;
      if (customer.address) profileUpdate.address = customer.address;
      if (customer.city) profileUpdate.city = customer.city;
      if (customer.postalCode) profileUpdate.postal_code = customer.postalCode;
      if (Object.keys(profileUpdate).length) {
        await supabase.from("profiles").update(profileUpdate).eq("id", userId);
      }

      // Acumula los payments a insertar: uno por cada item (camp/bono/rental) más
      // uno tipo 'order' para los productos físicos.
      const paymentRows: any[] = [];
      // NOTE: la tabla payments NO tiene columnas user_id ni notes;
      // referencia se hace por (reservation_type, reference_id).
      const paymentsBase = {
        payment_method: "online",
        channel: "web",
        payment_date: new Date().toISOString(),
      };

      // ---- Process CAMP reservations ----
      const camps = cart.filter((i: any) => i.type === "camp_reservation");
      for (const camp of camps) {
        const campId = camp.metadata?.campId || camp.id?.replace("camp-", "") || null;
        if (campId) {
          const { data: bk } = await supabase.from("bookings").insert({
            user_id: userId,
            camp_id: campId,
            deposit_amount: camp.price,
            total_amount: camp.metadata?.totalAmount || camp.price,
            status: "deposit_paid",
            notes: `Pedido #${orderId.slice(0, 8)} | Stripe: ${session.id}`,
          }).select("id").single();
          if (bk?.id) {
            paymentRows.push({
              ...paymentsBase,
              amount: camp.price,
              reservation_type: "booking",
              reference_id: bk.id,
              concept: `Señal surf camp ${camp.name || ''}`.trim(),
            });
          }
        }
      }

      // ---- Process CLASS reservation bonos ----
      const classes = cart.filter((i: any) => i.type === "class_reservation");
      for (const cls of classes) {
        const classType = cls.metadata?.classType || "grupal";
        const sessions = cls.metadata?.sessions || 1;
        const bonoPaid = cls.price * (cls.quantity || 1);
        const { data: bono } = await supabase.from("bonos").insert({
          user_id: userId,
          order_id: orderId,
          class_type: classType,
          total_credits: sessions * (cls.quantity || 1),
          used_credits: 0,
          total_paid: bonoPaid,
          status: "active",
          expires_at: getBonoExpiry(classType),
        }).select("id").single();
        if (bono?.id) {
          paymentRows.push({
            ...paymentsBase,
            amount: bonoPaid,
            reservation_type: "bono",
            reference_id: bono.id,
            concept: `Bono ${classType} · ${sessions} sesiones`,
          });

          // ---- Convertir las plazas preseleccionadas (holds) en inscripciones ----
          // Tope: nunca inscribir más plazas que créditos pagados (el array
          // bookings viene del cliente y podría venir manipulado).
          const maxCredits = sessions * (cls.quantity || 1);
          const bookings = (Array.isArray(cls.metadata?.bookings) ? cls.metadata.bookings : [])
            .slice(0, maxCredits);
          let bookedCount = 0;
          for (const bk of bookings) {
            if (bookedCount >= maxCredits) break;
            try {
              const att = bk.attendee || {};
              let familyMemberId: string | null = null;

              if (att.kind === "family" && att.family_member_id) {
                // Verifica que el familiar pertenece al usuario
                const { data: fm } = await supabase
                  .from("family_members").select("id")
                  .eq("id", att.family_member_id).eq("user_id", userId).maybeSingle();
                familyMemberId = fm?.id || null;
              } else if (att.kind === "guest" && att.guest_data) {
                // Crea el familiar vinculado a la cuenta del comprador
                const g = att.guest_data;
                const { data: newFm } = await supabase.from("family_members").insert({
                  user_id: userId,
                  full_name: g.full_name,
                  last_name: g.last_name || "",
                  birth_date: g.birth_date || null,
                  level: g.level || null,
                  wetsuit_size: g.wetsuit_size || null,
                  can_swim: typeof g.can_swim === "boolean" ? g.can_swim : null,
                  has_injury: !!g.has_injury,
                  injury_detail: g.injury_detail || null,
                }).select("id").single();
                familyMemberId = newFm?.id || null;
              }
              // kind === 'self' → familyMemberId queda null

              // Inscripción atómica: la RPC bloquea la clase (FOR UPDATE) y
              // revalida aforo dentro de la transacción → sin overbooking aunque
              // dos pagos coincidan. Si no hay plaza, devuelve false y el crédito
              // queda libre en el bono.
              const { data: enrolled, error: enrErr } = await supabase.rpc("enroll_from_webhook", {
                p_class_id: bk.classId,
                p_user_id: userId,
                p_family_member_id: familyMemberId,
                p_bono_id: bono.id,
              });
              if (enrErr) { console.error("enroll_from_webhook error:", enrErr.message); continue; }
              if (enrolled) bookedCount++;
            } catch (e: any) {
              console.error("Hold→enrollment error:", e?.message);
            }
          }

          // Libera cualquier hold sobrante del token
          if (cls.metadata?.cartToken) {
            try { await supabase.rpc("release_holds", { p_cart_token: cls.metadata.cartToken }); } catch {}
          }
          console.log(`Bono ${bono.id}: ${bookedCount}/${sessions * (cls.quantity || 1)} clases preasignadas`);
        }
      }

      // ---- Process BONO BALANCE payments (saldo pendiente pagado online) ----
      const bonoBalances = cart.filter((i: any) => i.type === "bono_balance");
      for (const bb of bonoBalances) {
        const bonoId = bb.metadata?.bonoId;
        const amt = Number(bb.price || 0) * (bb.quantity || 1);
        if (!bonoId || amt <= 0) continue;
        const { data: bono } = await supabase.from("bonos").select("total_paid, class_type").eq("id", bonoId).single();
        if (bono) {
          await supabase.from("bonos").update({
            total_paid: Number(bono.total_paid || 0) + amt,
            updated_at: new Date().toISOString(),
          }).eq("id", bonoId);
          // El bono queda saldado → marca sus inscripciones activas como pagadas
          await supabase.from("class_enrollments").update({ status: "paid" })
            .eq("bono_id", bonoId).in("status", ["partial", "confirmed"]);
          paymentRows.push({
            ...paymentsBase,
            amount: amt,
            reservation_type: "bono",
            reference_id: bonoId,
            concept: `Saldo bono ${bono.class_type || ''}`.trim(),
          });
        }
      }

      // ---- Process PRODUCT order items ----
      const products = cart.filter((i: any) => i.type === "product");
      let productsTotal = 0;
      for (const prod of products) {
        // Solo el UUID real del producto sirve como FK; prod.id es el id de
        // variante (slug-color-talla), no vale como product_id.
        const productId = prod.metadata?.productId || null;
        const variant = [prod.metadata?.color, prod.metadata?.size && `Talla ${prod.metadata.size}`]
          .filter(Boolean).join(" · ") || null;
        if (!productId) {
          console.error("Item de producto sin productId (carrito antiguo), omitido:", prod.name);
        }
        if (productId) {
          await supabase.from("order_items").insert({
            order_id: orderId,
            product_id: productId,
            quantity: prod.quantity || 1,
            unit_price: prod.price,
            variant,
          });
          productsTotal += Number(prod.price || 0) * (prod.quantity || 1);
          // Descuento de stock ATÓMICO (FOR UPDATE) de la variante color×talla:
          // evita la carrera read-modify-write en compras simultáneas.
          const { error: stkErr } = await supabase.rpc("decrement_product_stock", {
            p_id: productId,
            p_color: prod.metadata?.color || "",
            p_size: prod.metadata?.size || "",
            p_qty: prod.quantity || 1,
          });
          if (stkErr) console.error(`decrement_product_stock error ${productId}:`, stkErr.message);
        }
      }
      if (productsTotal > 0) {
        paymentRows.push({
          ...paymentsBase,
          amount: productsTotal,
          reservation_type: "order",
          reference_id: orderId,
          concept: `Pedido tienda #${orderId.slice(0, 8)}`,
        });
      }

      // ---- Process RENTAL reservations ----
      const rentals = cart.filter((i: any) => i.type === "rental");
      for (const rental of rentals) {
        if (rental.metadata) {
          const qty = rental.quantity || 1;
          const depositPaid = rental.price * qty;                                   // señal cobrada online
          const totalAmount = Number(rental.metadata.totalAmount ?? rental.price) * qty; // total real del alquiler
          const today = new Date().toISOString().slice(0, 10);
          const { data: rentalRow, error: rentalErr } = await supabase.from("equipment_reservations").insert({
            user_id: userId,
            equipment_id: rental.metadata.equipmentId || null,
            size: rental.metadata.size || null,
            duration_key: rental.metadata.duration || null,
            quantity: qty,
            date_start: rental.metadata.dateStart || today,
            date_end: rental.metadata.dateEnd || today,
            total_amount: totalAmount,
            deposit_paid: depositPaid,
            status: "confirmed",
            notes: `Pedido #${orderId.slice(0, 8)} | Stripe: ${session.id}`,
          }).select("id").single();
          if (rentalErr) console.error("rental reservation insert error:", rentalErr.message);
          if (rentalRow?.id) {
            // Asigna automáticamente una unidad libre al azar dentro de la talla
            // (sin solape de fechas). Si no hay, queda sin asignar y el admin la pone a mano.
            try { await supabase.rpc("assign_rental_unit", { p_reservation_id: rentalRow.id }); }
            catch (e: any) { console.error("assign_rental_unit error:", e?.message); }
            paymentRows.push({
              ...paymentsBase,
              amount: depositPaid,
              reservation_type: "rental",
              reference_id: rentalRow.id,
              concept: `Alquiler ${rental.name || rental.metadata.item || ''}`.trim(),
            });
          }
        }
      }

      // ---- Process RENTAL BALANCE payments (saldo pendiente pagado online) ----
      const rentalBalances = cart.filter((i: any) => i.type === "rental_balance");
      for (const rb of rentalBalances) {
        const reservationId = rb.metadata?.reservationId;
        const amt = Number(rb.price || 0) * (rb.quantity || 1);
        if (!reservationId || amt <= 0) continue;
        const { data: rsv } = await supabase.from("equipment_reservations")
          .select("total_amount, deposit_paid").eq("id", reservationId).single();
        if (rsv) {
          const newPaid = Math.min(Number(rsv.total_amount || 0), Number(rsv.deposit_paid || 0) + amt);
          await supabase.from("equipment_reservations")
            .update({ deposit_paid: newPaid, updated_at: new Date().toISOString() })
            .eq("id", reservationId);
          paymentRows.push({
            ...paymentsBase,
            amount: amt,
            reservation_type: "rental",
            reference_id: reservationId,
            concept: `Saldo alquiler`,
          });
        }
      }

      // ---- Create payment records ----
      // Si no se pudo descomponer (carrito vacío o sin metadatos), fallback a un solo payment 'order'.
      if (paymentRows.length === 0) {
        paymentRows.push({
          ...paymentsBase,
          amount: totalPaid,
          reservation_type: "order",
          reference_id: orderId,
        });
      }
      // El registro de pagos es crítico para la contabilidad: si falla, se
      // marca el pedido para reconciliación (supabase-js no lanza, devuelve error).
      const { error: payErr } = await supabase.from("payments").insert(paymentRows);
      if (payErr) {
        console.error(`payments.insert error order ${orderId}:`, payErr.message);
        await supabase.from("orders").update({ notes: `⚠ ERROR_PAGOS: ${payErr.message} (pedido pagado, revisar pagos)` }).eq("id", orderId);
      }

      // ---- Increment coupon usage ----
      if (meta.couponId) {
        await supabase.rpc("increment_coupon_usage", { p_coupon_id: meta.couponId });
      }

      // ---- Clean up Stripe coupon created on-the-fly ----
      if (session.total_details?.breakdown?.discounts?.length) {
        for (const d of session.total_details.breakdown.discounts) {
          try { await stripe.coupons.del(d.discount.coupon.id); } catch {}
        }
      }

      // ---- Send confirmation emails ----
      const sendEmail = async (to: string, type: string, emailData: any) => {
        try {
          await fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
            body: JSON.stringify({ to, type, data: emailData }),
          });
        } catch (e: any) { console.error(`Email to ${to} failed:`, e.message); }
      };

      try {
        const userEmail = session.customer_email || session.customer_details?.email;
        const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", userId).single();
        const customerName = profile?.full_name || "";
        const emailItems = cart.map((i: any) => ({ name: i.name, quantity: i.quantity || 1, price: i.price }));
        const emailData = { customerName, orderId, items: emailItems, total: totalPaid, customerEmail: userEmail };

        if (userEmail) {
          // Send one email per type in the cart
          if (camps.length > 0) await sendEmail(userEmail, "camp", emailData);
          if (classes.length > 0) await sendEmail(userEmail, "bono", emailData);
          if (products.length > 0) await sendEmail(userEmail, "order", emailData);
          // If cart has mixed types, each gets its own email. If only one type, one email.
          if (!camps.length && !classes.length && !products.length) {
            await sendEmail(userEmail, "order", emailData);
          }
        }

        // Notify admin
        const adminEmail = Deno.env.get("ADMIN_EMAIL") || "entreolasurf@gmail.com";
        await sendEmail(adminEmail, "admin_new_order", emailData);
      } catch (emailErr: any) {
        console.error("Email sending failed (non-blocking):", emailErr.message);
      }

      console.log(`Order ${orderId} completed for user ${userId}, total: ${totalPaid}€, items: ${cart.length}`);
    } catch (err: any) {
      console.error("Webhook processing error:", err);
      if (orderClaimed) {
        // El pedido ya está pagado: NO devolver 500 (Stripe reintentaría y, al
        // estar 'paid', saltaría el pedido). Se marca para reconciliación manual.
        try {
          await supabase.from("orders")
            .update({ notes: `⚠ ERROR_PROC: ${err.message} (pedido pagado, revisar)` })
            .eq("id", orderId);
        } catch (_) { /* nada que hacer */ }
        return new Response(JSON.stringify({ received: true, partial_error: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      // Aún no reclamado (fallo antes del claim): 500 para que Stripe reintente.
      return new Response(`Processing error: ${err.message}`, { status: 500 });
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
