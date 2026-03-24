import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const SMTP_HOST = Deno.env.get("SMTP_HOST") || "smtp.hostinger.com";
const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") || "465");
const SMTP_USER = Deno.env.get("SMTP_USER") || "noreply@entreolasurf.com";
const SMTP_PASS = Deno.env.get("SMTP_PASS") || "";
const FROM = `Entre Olas Surf <${SMTP_USER}>`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function orderConfirmationHtml(data: any) {
  const { customerName, orderId, items, total, type } = data;

  const itemsHtml = (items || []).map((i: any) =>
    `<tr><td style="padding:8px 0;border-bottom:1px solid #eee">${i.name}</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">${i.quantity || 1}x</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">${Number(i.price).toFixed(2)}€</td></tr>`
  ).join("");

  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#fffdf7;font-family:Manrope,Helvetica,Arial,sans-serif;color:#0f2f39">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <div style="text-align:center;margin-bottom:28px">
      <span style="font-size:1.4rem;font-weight:700;letter-spacing:.04em"><span style="color:#0f2f39">entre</span><span style="color:#f3c900">olas</span></span>
    </div>

    <div style="background:#fff;border-radius:14px;border:1px solid #e5e0d0;padding:28px 24px">
      <h1 style="font-size:1.5rem;margin:0 0 6px;color:#0f2f39">Gracias, ${customerName || "surfista"}!</h1>
      <p style="color:#64757d;font-size:.92rem;margin:0 0 24px">Tu ${type === "camp" ? "reserva de Surf Camp" : type === "bono" ? "bono de clases" : "pedido"} ha sido confirmado.</p>

      <div style="background:#f8f6f0;border-radius:10px;padding:16px;margin-bottom:20px">
        <p style="margin:0;font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:#64757d;font-weight:600">Referencia</p>
        <p style="margin:4px 0 0;font-size:1.1rem;font-weight:700;color:#0f2f39">#${(orderId || "").substring(0, 8)}</p>
      </div>

      ${itemsHtml ? `
      <table style="width:100%;border-collapse:collapse;font-size:.9rem;margin-bottom:16px">
        <thead><tr><th style="text-align:left;padding:8px 0;border-bottom:2px solid #0f2f39;font-size:.72rem;text-transform:uppercase;letter-spacing:.04em;color:#64757d">Concepto</th><th style="text-align:right;padding:8px 0;border-bottom:2px solid #0f2f39;font-size:.72rem;text-transform:uppercase;letter-spacing:.04em;color:#64757d">Cant.</th><th style="text-align:right;padding:8px 0;border-bottom:2px solid #0f2f39;font-size:.72rem;text-transform:uppercase;letter-spacing:.04em;color:#64757d">Precio</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>` : ""}

      <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-top:2px solid #0f2f39">
        <span style="font-weight:700;font-size:1rem">Total pagado</span>
        <span style="font-weight:700;font-size:1.2rem;color:#0f2f39">${Number(total || 0).toFixed(2)}€</span>
      </div>

      ${type === "camp" ? `
      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:14px;margin-top:16px;font-size:.88rem;color:#0369a1">
        <strong>Proximos pasos:</strong> Nos pondremos en contacto contigo para confirmar los detalles del camp. Si tienes preguntas, escribenos a info@entreolasurf.com
      </div>` : ""}

      ${type === "bono" ? `
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px;margin-top:16px;font-size:.88rem;color:#166534">
        <strong>Tu bono esta activo!</strong> Ve a <a href="https://entreolasurf.com/mi-cuenta/" style="color:#166534;font-weight:600">Mi Cuenta</a> para reservar tus clases en el calendario.
      </div>` : ""}

      ${type === "order" ? `
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px;margin-top:16px;font-size:.88rem;color:#92400e">
        <strong>Envio:</strong> Te avisaremos cuando tu pedido sea enviado.
      </div>` : ""}
    </div>

    <div style="text-align:center;margin-top:28px;padding-top:20px;border-top:1px solid #e5e0d0">
      <p style="font-size:.82rem;color:#64757d;margin:0">Entre Olas Surf · Roche, Conil de la Frontera</p>
      <p style="font-size:.78rem;color:#64757d;margin:4px 0 0">info@entreolasurf.com · entreolasurf.com</p>
    </div>
  </div>
</body></html>`;
}

function subjectForType(type: string, orderId: string) {
  const ref = orderId ? ` #${orderId.substring(0, 8)}` : "";
  switch (type) {
    case "camp": return `Reserva de Surf Camp confirmada${ref}`;
    case "bono": return `Tu bono de clases esta activo${ref}`;
    case "order": return `Pedido confirmado${ref}`;
    default: return `Confirmacion de pago${ref}`;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { to, type, data } = await req.json();

    if (!to || !type) {
      return new Response(JSON.stringify({ error: "Missing 'to' or 'type'" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const subject = subjectForType(type, data?.orderId);
    const html = orderConfirmationHtml({ ...data, type });

    const client = new SMTPClient({
      connection: {
        hostname: SMTP_HOST,
        port: SMTP_PORT,
        tls: true,
        auth: { username: SMTP_USER, password: SMTP_PASS },
      },
    });

    await client.send({
      from: FROM,
      to,
      subject,
      html,
    });

    await client.close();

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-email error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
