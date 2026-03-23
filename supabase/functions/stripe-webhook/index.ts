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

      // ---- Process CAMP reservations ----
      const camps = cart.filter((i: any) => i.type === "camp_reservation");
      for (const camp of camps) {
        const campId = camp.metadata?.campId || camp.id?.replace("camp-", "") || null;
        if (campId) {
          await supabase.from("bookings").insert({
            user_id: userId,
            camp_id: campId,
            deposit_amount: camp.price,
            total_amount: camp.metadata?.totalAmount || camp.price,
            status: "deposit_paid",
            notes: `Pedido #${orderId.slice(0, 8)} | Stripe: ${session.id}`,
          });
        }
      }

      // ---- Process CLASS reservation bonos ----
      const classes = cart.filter((i: any) => i.type === "class_reservation");
      for (const cls of classes) {
        const classType = cls.metadata?.classType || "grupal";
        const sessions = cls.metadata?.sessions || 1;
        await supabase.from("bonos").insert({
          user_id: userId,
          order_id: orderId,
          class_type: classType,
          total_credits: sessions * (cls.quantity || 1),
          used_credits: 0,
          total_paid: cls.price * (cls.quantity || 1),
          status: "active",
          expires_at: getBonoExpiry(classType),
        });
      }

      // ---- Process PRODUCT order items ----
      const products = cart.filter((i: any) => i.type === "product");
      for (const prod of products) {
        const productId = prod.metadata?.productId || prod.id || null;
        if (productId) {
          await supabase.from("order_items").insert({
            order_id: orderId,
            product_id: productId,
            quantity: prod.quantity || 1,
            unit_price: prod.price,
          });
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

      // ---- Process RENTAL reservations ----
      const rentals = cart.filter((i: any) => i.type === "rental");
      for (const rental of rentals) {
        if (rental.metadata) {
          await supabase.from("equipment_reservations").insert({
            user_id: userId,
            equipment_type: rental.metadata.equipmentType || rental.name,
            date_start: rental.metadata.dateStart || new Date().toISOString().slice(0, 10),
            date_end: rental.metadata.dateEnd || new Date().toISOString().slice(0, 10),
            total_amount: rental.price * (rental.quantity || 1),
            status: "confirmed",
            notes: `Pedido #${orderId.slice(0, 8)} | Stripe: ${session.id}`,
          });
        }
      }

      // ---- Create payment record ----
      await supabase.from("payments").insert({
        user_id: userId,
        amount: totalPaid,
        payment_method: "stripe",
        payment_date: new Date().toISOString(),
        reservation_type: "order",
        reference_id: orderId,
        notes: `Stripe session: ${session.id}`,
      });

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
