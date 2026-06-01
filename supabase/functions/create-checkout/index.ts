import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization")?.replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let userId: string | null = null;
    let userEmail: string | null = null;

    if (authHeader) {
      const { data: { user } } = await supabase.auth.getUser(authHeader);
      userId = user?.id || null;
      userEmail = user?.email || null;
    }

    const { items, customer, couponCode, successUrl, cancelUrl } = await req.json();

    if (!items?.length) {
      return new Response(JSON.stringify({ error: "Carrito vacío" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Revalidación de precios en el servidor (anti-manipulación de localStorage) ---
    // Productos: precio y disponibilidad reales desde la BD (ignora el precio del cliente).
    const productItems = items.filter((i: any) => i.type === "product");
    if (productItems.length) {
      const ids = [...new Set(productItems.map((i: any) => i.metadata?.productId).filter(Boolean))];
      const { data: dbProducts } = await supabase
        .from("products").select("id, price, status")
        .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const pmap: Record<string, any> = {};
      (dbProducts || []).forEach((p: any) => { pmap[p.id] = p; });
      for (const it of productItems) {
        const p = pmap[it.metadata?.productId];
        if (!p || p.status !== "active") {
          return new Response(JSON.stringify({ error: `Producto no disponible: ${it.name}` }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        it.price = Number(p.price); // precio real
      }
    }

    // Packs de clase: el importe cobrado es el ANTICIPO (activities.deposit por tipo)
    const classItems = items.filter((i: any) => i.type === "class_reservation");
    if (classItems.length) {
      const { data: acts } = await supabase.from("activities").select("type_key, deposit");
      const depByType: Record<string, number> = {};
      (acts || []).forEach((a: any) => { depByType[a.type_key] = Number(a.deposit); });
      for (const it of classItems) {
        const dep = depByType[it.metadata?.classType];
        if (dep == null || Number.isNaN(dep)) {
          return new Response(JSON.stringify({ error: `Actividad no disponible: ${it.name}` }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        it.price = dep; // anticipo real, ignora el del cliente
      }
    }

    // Surf camps: el importe cobrado es la señal (surf_camps.deposit)
    const campItems = items.filter((i: any) => i.type === "camp_reservation");
    if (campItems.length) {
      const campId = (i: any) => i.metadata?.campId || (i.id || "").replace("camp-", "");
      const ids = [...new Set(campItems.map(campId).filter(Boolean))];
      const { data: camps } = await supabase.from("surf_camps").select("id, deposit")
        .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const depById: Record<string, number> = {};
      (camps || []).forEach((c: any) => { depById[c.id] = Number(c.deposit); });
      for (const it of campItems) {
        const dep = depById[campId(it)];
        if (dep == null || Number.isNaN(dep)) {
          return new Response(JSON.stringify({ error: `Surf camp no disponible: ${it.name}` }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        it.price = dep; // señal real
      }
    }

    // Alquiler: la tarifa real es rental_equipment.pricing[duration]
    const rentalItems = items.filter((i: any) => i.type === "rental" && i.metadata?.equipmentId);
    if (rentalItems.length) {
      const ids = [...new Set(rentalItems.map((i: any) => i.metadata.equipmentId))];
      const { data: eqs } = await supabase.from("rental_equipment").select("id, pricing")
        .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const eqById: Record<string, any> = {};
      (eqs || []).forEach((e: any) => { eqById[e.id] = e; });
      for (const it of rentalItems) {
        const eq = eqById[it.metadata.equipmentId];
        const real = eq?.pricing?.[it.metadata.duration];
        if (real == null || Number.isNaN(Number(real))) {
          return new Response(JSON.stringify({ error: `Alquiler no disponible: ${it.name}` }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        it.price = Number(real); // tarifa real por duración
      }
    }

    // Sanidad general: precio no negativo y cantidad razonable
    for (const it of items) {
      if (!(Number(it.price) >= 0)) {
        return new Response(JSON.stringify({ error: "Precio inválido en el carrito" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      it.quantity = Math.min(Math.max(parseInt(it.quantity, 10) || 1, 1), 50);
    }

    // Store cart in a temporary DB row to avoid Stripe metadata 500-char limit
    const pendingOrder = {
      user_id: userId,
      status: "pending",
      total: 0,
      shipping_address: [customer?.address, customer?.city, customer?.postalCode].filter(Boolean).join(", ") || null,
      notes: customer?.notes || null,
      wants_invoice: !!customer?.wantsInvoice,
      invoice_name: customer?.invoiceName || null,
      invoice_tax_id: customer?.invoiceTaxId || null,
      invoice_address: customer?.invoiceAddress || null,
    };
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert(pendingOrder)
      .select()
      .single();

    if (orderErr) throw orderErr;

    // Store cart JSON in order notes temporarily (will be replaced by webhook)
    const cartJson = JSON.stringify(items);
    await supabase.from("orders").update({
      notes: `__cart__:${cartJson}|__customer__:${JSON.stringify(customer || {})}`,
    }).eq("id", order.id);

    // Validate coupon
    let coupon: any = null;
    let stripeDiscounts: Stripe.Checkout.SessionCreateParams.Discount[] = [];

    if (couponCode) {
      const { data: couponData } = await supabase
        .from("coupons")
        .select("*")
        .eq("code", couponCode.toUpperCase())
        .eq("active", true)
        .single();

      if (couponData) {
        const now = new Date();
        const cartTotal = items.reduce((s: number, i: any) => s + Number(i.price) * (i.quantity || 1), 0);
        // Mismas reglas que el cliente, pero aquí mandan (no se puede saltar)
        const eligible = items.some((i: any) => {
          switch (couponData.applies_to) {
            case "all": return true;
            case "camps": return i.type === "camp_reservation";
            case "classes": return i.type === "class_reservation" &&
              (!couponData.activity_type || i.metadata?.classType === couponData.activity_type);
            case "products": return i.type === "product";
            case "rentals": return i.type === "rental";
            default: return false;
          }
        });
        const valid =
          (!couponData.starts_at || new Date(couponData.starts_at) <= now) &&
          (!couponData.expires_at || new Date(couponData.expires_at) > now) &&
          (!couponData.max_uses || couponData.used_count < couponData.max_uses) &&
          (!couponData.min_amount || cartTotal >= Number(couponData.min_amount)) &&
          eligible;

        if (valid) {
          coupon = couponData;
          const stripeCoupon = await stripe.coupons.create(
            couponData.discount_type === "percentage"
              ? { percent_off: Math.min(Number(couponData.discount_value), 100), duration: "once" }
              // Tope: el descuento fijo nunca supera el total del carrito
              : { amount_off: Math.min(Math.round(Number(couponData.discount_value) * 100), Math.round(cartTotal * 100)), currency: "eur", duration: "once" }
          );
          stripeDiscounts = [{ coupon: stripeCoupon.id }];
        }
      }
    }

    // Build line items
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = items.map((item: any) => {
      let name = item.name;
      if (item.type === "class_reservation") name = `${item.name} (anticipo)`;
      else if (item.type === "camp_reservation") name = `${item.name} (señal)`;

      return {
        price_data: {
          currency: "eur",
          product_data: { name },
          unit_amount: Math.round(Number(item.price) * 100),
        },
        quantity: item.quantity || 1,
      };
    });

    // Metadata: only short references (under 500 chars each)
    const metadata: Record<string, string> = {
      orderId: order.id,
      userId: userId || "",
      couponId: coupon?.id || "",
      couponCode: coupon?.code || "",
    };

    if (customer?.phone) metadata.phone = customer.phone;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: lineItems,
      discounts: stripeDiscounts.length ? stripeDiscounts : undefined,
      customer_email: userEmail || customer?.email || undefined,
      metadata,
      success_url: successUrl || `${req.headers.get("origin")}/finalizar-compra/?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${req.headers.get("origin")}/carrito/`,
      locale: "es",
    });

    // Save stripe session ID to order
    await supabase.from("orders").update({
      notes: `__cart__:${cartJson}|__customer__:${JSON.stringify(customer || {})}|stripe_session:${session.id}`,
    }).eq("id", order.id);

    return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("create-checkout error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
