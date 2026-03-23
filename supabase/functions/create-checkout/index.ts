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
    // Get user from auth header
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
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate coupon if provided
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
        const valid =
          (!couponData.starts_at || new Date(couponData.starts_at) <= now) &&
          (!couponData.expires_at || new Date(couponData.expires_at) > now) &&
          (!couponData.max_uses || couponData.used_count < couponData.max_uses);

        if (valid) {
          coupon = couponData;
          // Create Stripe coupon on the fly
          const stripeCoupon = await stripe.coupons.create(
            couponData.discount_type === "percentage"
              ? { percent_off: Number(couponData.discount_value), duration: "once" }
              : { amount_off: Math.round(Number(couponData.discount_value) * 100), currency: "eur", duration: "once" }
          );
          stripeDiscounts = [{ coupon: stripeCoupon.id }];
        }
      }
    }

    // Build line items
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = items.map((item: any) => {
      const unitAmount = Math.round(Number(item.price) * 100);
      let name = item.name;

      if (item.type === "class_reservation") {
        name = `${item.name} (anticipo)`;
      } else if (item.type === "camp_reservation") {
        name = `${item.name} (señal)`;
      }

      return {
        price_data: {
          currency: "eur",
          product_data: {
            name,
            metadata: {
              type: item.type,
              itemId: item.id,
              ...(item.metadata || {}),
            },
          },
          unit_amount: unitAmount,
        },
        quantity: item.quantity || 1,
      };
    });

    // Metadata for webhook to process the order
    const metadata: Record<string, string> = {
      cart: JSON.stringify(items),
      userId: userId || "",
      couponId: coupon?.id || "",
      couponCode: coupon?.code || "",
    };

    if (customer?.phone) metadata.phone = customer.phone;
    if (customer?.address) metadata.address = customer.address;
    if (customer?.city) metadata.city = customer.city;
    if (customer?.postalCode) metadata.postalCode = customer.postalCode;
    if (customer?.notes) metadata.notes = customer.notes;

    // Create Stripe Checkout Session
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

    return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("create-checkout error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
