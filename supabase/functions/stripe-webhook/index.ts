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

      await supabase.from("orders").update({
        status: "paid",
        total: totalPaid,
        notes: finalNotes,
      }).eq("id", orderId);

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
          const bookings = Array.isArray(cls.metadata?.bookings) ? cls.metadata.bookings : [];
          let bookedCount = 0;
          for (const bk of bookings) {
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

              // Revalida plaza (el hold pudo caducar si tardó >10 min en pagar)
              const { data: sc } = await supabase
                .from("surf_classes")
                .select("max_students, enrolled_count, status, published")
                .eq("id", bk.classId).single();
              if (!sc || sc.published !== true || sc.status !== "scheduled" ||
                  sc.enrolled_count >= sc.max_students) {
                continue; // sin plaza → queda como crédito libre en el bono
              }

              const { error: enrErr } = await supabase.from("class_enrollments").insert({
                class_id: bk.classId,
                user_id: userId,
                family_member_id: familyMemberId,
                bono_id: bono.id,
                status: "confirmed",
              });
              if (!enrErr) bookedCount++;
              else console.error("Enrollment insert error:", enrErr.message);
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
        const productId = prod.metadata?.productId || prod.id || null;
        if (productId) {
          await supabase.from("order_items").insert({
            order_id: orderId,
            product_id: productId,
            quantity: prod.quantity || 1,
            unit_price: prod.price,
          });
          productsTotal += Number(prod.price || 0) * (prod.quantity || 1);
          // Decrease stock
          const { data: product } = await supabase
            .from("products").select("stock").eq("id", productId).single();
          if (product && product.stock !== null) {
            await supabase.from("products")
              .update({ stock: Math.max((product.stock || 0) - (prod.quantity || 1), 0) })
              .eq("id", productId);
          }
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
          const rentalTotal = rental.price * (rental.quantity || 1);
          const { data: rentalRow } = await supabase.from("equipment_reservations").insert({
            user_id: userId,
            equipment_type: rental.metadata.equipmentType || rental.name,
            date_start: rental.metadata.dateStart || new Date().toISOString().slice(0, 10),
            date_end: rental.metadata.dateEnd || new Date().toISOString().slice(0, 10),
            total_amount: rentalTotal,
            deposit_paid: rentalTotal,
            status: "confirmed",
            notes: `Pedido #${orderId.slice(0, 8)} | Stripe: ${session.id}`,
          }).select("id").single();
          if (rentalRow?.id) {
            paymentRows.push({
              ...paymentsBase,
              amount: rentalTotal,
              reservation_type: "rental",
              reference_id: rentalRow.id,
              concept: `Alquiler ${rental.name || rental.metadata.equipmentType}`,
            });
          }
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
      await supabase.from("payments").insert(paymentRows);

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
      return new Response(`Processing error: ${err.message}`, { status: 500 });
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
