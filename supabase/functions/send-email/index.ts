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

/*
  Brand tokens (from style.css):
  bg:      #fffdf7 (cream)
  sand:    #f3ecdd
  yellow:  #FFCC01
  navy:    #0f2f39
  text:    #2d3d45
  muted:   #64757d
  line:    #d7d0c2
  btn radius: 999px (pill)
  labels:  uppercase, letter-spacing, small
  body font: Manrope → fallback Helvetica
  display: Bebas Neue → fallback Impact, sans-serif
  ui:      Space Grotesk → fallback Trebuchet MS
*/

const F = "Helvetica,Arial,sans-serif"; // body
const FU = "'Trebuchet MS',Helvetica,sans-serif"; // ui/labels

/* Logos */
function logoDefault() {
  return `<table cellpadding="0" cellspacing="0"><tr>
    <td style="font-family:${F};font-size:26px;font-weight:700;color:#0f2f39">entre</td>
    <td style="font-family:${F};font-size:26px;font-weight:700;color:#FFCC01">olas</td>
  </tr></table>`;
}

function logoCamp() {
  return `<table cellpadding="0" cellspacing="0">
    <tr><td style="font-family:${FU};font-size:16px;font-weight:800;color:#FFCC01;letter-spacing:2px;text-transform:uppercase;line-height:1.15">ENTRE OLAS</td></tr>
    <tr><td style="font-family:${FU};font-size:16px;font-weight:800;color:#FFCC01;letter-spacing:2px;text-transform:uppercase;line-height:1.15">SURF HOUSE</td></tr>
  </table>`;
}

/* Label like the site uses */
function label(text: string) {
  return `<td style="font-family:${FU};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#64757d">${text}</td>`;
}

/* Pill button like .btn.red */
function btnYellow(text: string, href?: string) {
  const tag = href ? "a" : "span";
  return `<table cellpadding="0" cellspacing="0" style="margin-top:24px"><tr><td>
    <${tag}${href ? ` href="${href}"` : ""} style="display:inline-block;background-color:#FFCC01;color:#111719;font-family:${FU};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;text-decoration:none;padding:13px 28px;border-radius:999px">${text}</${tag}>
  </td></tr></table>`;
}

function btnNavy(text: string, href?: string) {
  const tag = href ? "a" : "span";
  return `<table cellpadding="0" cellspacing="0" style="margin-top:24px"><tr><td>
    <${tag}${href ? ` href="${href}"` : ""} style="display:inline-block;background-color:#0f2f39;color:#ffffff;font-family:${FU};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;text-decoration:none;padding:13px 28px;border-radius:999px">${text}</${tag}>
  </td></tr></table>`;
}

/* Items table */
function itemsTable(items: any[]) {
  if (!items?.length) return "";
  const rows = items.map((i: any) =>
    `<tr>
      <td style="padding:11px 0;border-bottom:1px solid #d7d0c2;font-family:${F};font-size:14px;color:#2d3d45">${i.name}</td>
      <td style="padding:11px 0;border-bottom:1px solid #d7d0c2;font-family:${F};font-size:14px;color:#64757d;text-align:center;width:36px">${i.quantity || 1}</td>
      <td style="padding:11px 0;border-bottom:1px solid #d7d0c2;font-family:${F};font-size:14px;color:#0f2f39;text-align:right;width:75px;font-weight:700">${Number(i.price).toFixed(2)}&#8364;</td>
    </tr>`
  ).join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0">
    <tr>
      ${label("Concepto")}
      <td style="font-family:${FU};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#64757d;text-align:center;width:36px">Ud.</td>
      <td style="font-family:${FU};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#64757d;text-align:right;width:75px">Precio</td>
    </tr>
    <tr><td colspan="3" style="border-bottom:2px solid #0f2f39;padding:0;height:8px"></td></tr>
    ${rows}
  </table>`;
}

function totalBar(total: number) {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f2f39;border-radius:10px;margin-top:4px">
    <tr>
      <td style="padding:16px 20px;font-family:${FU};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,.6)">Total pagado</td>
      <td style="padding:16px 20px;font-family:${F};font-size:24px;font-weight:700;color:#FFCC01;text-align:right">${total.toFixed(2)}&#8364;</td>
    </tr>
  </table>`;
}

function refTag(orderId: string) {
  const ref = (orderId || "").substring(0, 8);
  return `<table cellpadding="0" cellspacing="0" style="margin-bottom:20px"><tr>
    <td style="background-color:#f3ecdd;border-radius:999px;padding:6px 16px;font-family:${FU};font-size:11px;font-weight:700;letter-spacing:1px;color:#64757d;text-transform:uppercase">Ref #${ref}</td>
  </tr></table>`;
}

function sandBox(html: string) {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px"><tr>
    <td style="background-color:#f3ecdd;border-radius:10px;padding:16px 20px;font-family:${F};font-size:13px;color:#2d3d45;line-height:1.6">${html}</td>
  </tr></table>`;
}

function heading(text: string) {
  return `<p style="font-family:${F};font-size:24px;font-weight:700;color:#0f2f39;margin:0 0 6px;line-height:1.2">${text}</p>`;
}

function sub(text: string) {
  return `<p style="font-family:${F};font-size:14px;color:#64757d;margin:0 0 20px;line-height:1.5">${text}</p>`;
}

/* Wrap: cream bg → sand header with logo → white content → sand footer */
function emailWrap(logo: string, content: string, isCamp: boolean) {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#fffdf7">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fffdf7"><tr><td align="center" style="padding:24px 16px">
<table width="540" cellpadding="0" cellspacing="0" style="max-width:540px;width:100%">

  <!-- HEADER: sand bg with logo -->
  <tr><td style="background-color:#f3ecdd;padding:${isCamp ? "22px 28px" : "20px 28px"};border-radius:18px 18px 0 0" align="center">
    ${logo}
  </td></tr>

  <!-- Yellow accent line -->
  <tr><td style="height:3px;background-color:#FFCC01;font-size:0;line-height:0">&nbsp;</td></tr>

  <!-- CONTENT: white -->
  <tr><td style="background-color:#ffffff;padding:28px 28px 32px">
    ${content}
  </td></tr>

  <!-- FOOTER: navy -->
  <tr><td style="background-color:#0f2f39;border-radius:0 0 18px 18px;padding:20px 28px" align="center">
    <p style="font-family:${FU};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:rgba(255,255,255,.3);margin:0 0 6px">Entre Olas Surf</p>
    <p style="font-family:${F};font-size:12px;color:rgba(255,255,255,.45);margin:0">Roche, Conil de la Frontera</p>
    <p style="font-family:${F};font-size:12px;color:rgba(255,255,255,.45);margin:4px 0 0">entreolasurf@gmail.com</p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

/* ============================================================
   Email types
   ============================================================ */
function buildEmail(type: string, data: any): { subject: string; html: string } {
  const d = data || {};
  const name = d.customerName || "";
  const ref = (d.orderId || "").substring(0, 8);

  switch (type) {
    case "order": return {
      subject: `Pedido confirmado #${ref}`,
      html: emailWrap(logoDefault(), [
        heading(`Gracias, ${name || "surfista"}!`),
        sub("Tu pedido ha sido confirmado y lo estamos preparando."),
        refTag(d.orderId),
        itemsTable(d.items),
        totalBar(d.total || 0),
        sandBox("<strong>Envio:</strong> Te avisaremos por email cuando tu pedido este en camino."),
      ].join(""), false),
    };

    case "camp": return {
      subject: `Reserva Surf Camp confirmada #${ref}`,
      html: emailWrap(logoCamp(), [
        heading(`Nos vemos en el agua, ${name || "surfista"}!`),
        sub("Tu plaza en el Surf Camp esta reservada."),
        refTag(d.orderId),
        itemsTable(d.items),
        totalBar(d.total || 0),
        sandBox("<strong>Proximos pasos:</strong> Nos pondremos en contacto contigo para confirmar transporte, alojamiento y detalles. Cualquier duda, escribenos a entreolasurf@gmail.com"),
      ].join(""), true),
    };

    case "bono": return {
      subject: `Bono de clases activo #${ref}`,
      html: emailWrap(logoDefault(), [
        heading(`Tu bono esta listo, ${name || "surfista"}!`),
        sub("Ya puedes reservar tus clases desde tu cuenta."),
        refTag(d.orderId),
        itemsTable(d.items),
        totalBar(d.total || 0),
        btnYellow("RESERVAR MIS CLASES", "https://entreolasurf.com/mi-cuenta/"),
      ].join(""), false),
    };

    case "order_cancelled": return {
      subject: `Pedido cancelado #${ref}`,
      html: emailWrap(logoDefault(), [
        heading(`Pedido cancelado`),
        sub(`${name ? name + ", tu" : "Tu"} pedido ha sido cancelado.`),
        refTag(d.orderId),
        d.total ? totalBar(d.total) : "",
        sandBox(`${d.reason || "Si tienes preguntas, contactanos en entreolasurf@gmail.com"}`),
      ].join(""), false),
    };

    case "order_shipped": return {
      subject: `Pedido enviado #${ref}`,
      html: emailWrap(logoDefault(), [
        heading(`Tu pedido esta en camino!`),
        sub(`${name ? name + ", tu" : "Tu"} pedido ha sido enviado.`),
        refTag(d.orderId),
        sandBox(`${d.trackingInfo || "Te llegara en los proximos dias."}`),
      ].join(""), false),
    };

    case "camp_cancelled": return {
      subject: `Reserva Surf Camp cancelada #${ref}`,
      html: emailWrap(logoCamp(), [
        heading(`Reserva cancelada`),
        sub(`${name ? name + ", tu" : "Tu"} reserva de Surf Camp ha sido cancelada.`),
        refTag(d.orderId),
        sandBox(`${d.reason || "Si crees que es un error, escribenos a entreolasurf@gmail.com"}`),
      ].join(""), true),
    };

    case "class_booked": return {
      subject: `Clase reservada: ${d.className || ""}`,
      html: emailWrap(logoDefault(), [
        heading(`Clase reservada!`),
        sub(`${name ? name + ", tu" : "Tu"} plaza esta confirmada.`),
        `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px"><tr>
          <td style="background-color:#f3ecdd;border-radius:10px;padding:18px 20px">
            <p style="font-family:${F};font-size:18px;font-weight:700;color:#0f2f39;margin:0 0 4px">${d.className || ""}</p>
            <p style="font-family:${F};font-size:14px;color:#64757d;margin:0">${d.classDate || ""} &middot; ${d.classTime || ""}</p>
            ${d.instructor ? `<p style="font-family:${F};font-size:13px;color:#64757d;margin:6px 0 0">Instructor: <strong style="color:#0f2f39">${d.instructor}</strong></p>` : ""}
          </td>
        </tr></table>`,
        sandBox("Llega 10 minutos antes. Si necesitas cancelar, hazlo con al menos 2h de antelacion desde tu cuenta."),
      ].join(""), false),
    };

    case "class_cancelled": return {
      subject: `Clase cancelada: ${d.className || ""}`,
      html: emailWrap(logoDefault(), [
        heading(`Clase cancelada`),
        sub(`Tu reserva ha sido cancelada.`),
        `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px"><tr>
          <td style="background-color:#f3ecdd;border-radius:10px;padding:18px 20px">
            <p style="font-family:${F};font-size:18px;font-weight:700;color:#0f2f39;margin:0 0 4px">${d.className || "Clase"}</p>
            <p style="font-family:${F};font-size:14px;color:#64757d;margin:0">${d.classDate || ""} &middot; ${d.classTime || ""}</p>
          </td>
        </tr></table>`,
        sandBox("El credito ha sido devuelto a tu bono. Puedes reservar otra clase desde tu cuenta."),
      ].join(""), false),
    };

    case "welcome": return {
      subject: "Bienvenido a Entre Olas!",
      html: emailWrap(logoDefault(), [
        heading(`Bienvenido, ${name || "surfista"}!`),
        sub("Tu cuenta esta lista. Esto es lo que puedes hacer:"),
        sandBox("&#8226; Reservar clases de surf, yoga, paddle surf y surfskate<br>&#8226; Comprar packs con descuento<br>&#8226; Reservar tu plaza en los Surf Camps<br>&#8226; Comprar productos en la tienda"),
        btnYellow("IR A MI CUENTA", "https://entreolasurf.com/mi-cuenta/"),
      ].join(""), false),
    };

    case "contact": {
      const fields = Object.entries(d)
        .filter(([k]) => !["customerName", "page"].includes(k))
        .map(([k, v]) => `<p style="font-family:${F};font-size:13px;color:#64757d;margin:4px 0"><strong style="color:#0f2f39">${k}:</strong> ${v}</p>`)
        .join("");
      return {
        subject: `Nuevo mensaje de contacto — ${d.nombre || "Sin nombre"}`,
        html: emailWrap(logoDefault(), [
          heading("Nuevo mensaje de contacto"),
          sub(`Enviado desde ${d.page || "la web"}`),
          `<table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="background-color:#f3ecdd;border-radius:10px;padding:18px 20px">
              ${fields}
            </td>
          </tr></table>`,
        ].join(""), false),
      };
    }

    case "admin_class_booked": return {
      subject: `Nueva reserva de clase: ${d.className || ""} — ${d.customerName || "Cliente"}`,
      html: emailWrap(logoDefault(), [
        heading("Nueva reserva de clase"),
        sub(`${d.customerName || "Un cliente"} ha reservado una clase.`),
        `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px"><tr>
          <td style="background-color:#f3ecdd;border-radius:10px;padding:14px 20px">
            <p style="font-family:${F};font-size:13px;color:#64757d;margin:0">Cliente: <strong style="color:#0f2f39">${d.customerName || ""}</strong></p>
            <p style="font-family:${F};font-size:13px;color:#64757d;margin:4px 0 0">Email: <strong style="color:#0f2f39">${d.customerEmail || ""}</strong></p>
          </td>
        </tr></table>`,
        `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px"><tr>
          <td style="background-color:#ffffff;border:1px solid #d7d0c2;border-radius:10px;padding:18px 20px">
            <p style="font-family:${F};font-size:18px;font-weight:700;color:#0f2f39;margin:0 0 4px">${d.className || ""}</p>
            <p style="font-family:${F};font-size:14px;color:#64757d;margin:0">${d.classDate || ""} &middot; ${d.classTime || ""}</p>
            ${d.classType ? `<p style="font-family:${F};font-size:13px;color:#64757d;margin:6px 0 0">Tipo: <strong style="color:#0f2f39">${d.classType}</strong></p>` : ""}
            ${d.instructor ? `<p style="font-family:${F};font-size:13px;color:#64757d;margin:4px 0 0">Instructor: <strong style="color:#0f2f39">${d.instructor}</strong></p>` : ""}
            ${d.spots ? `<p style="font-family:${F};font-size:13px;color:#64757d;margin:4px 0 0">Plazas: <strong style="color:#0f2f39">${d.spots}</strong></p>` : ""}
          </td>
        </tr></table>`,
      ].join(""), false),
    };

    case "admin_class_cancelled": return {
      subject: `Cancelacion de clase: ${d.className || ""} — ${d.customerName || "Cliente"}`,
      html: emailWrap(logoDefault(), [
        heading("Cancelacion de reserva"),
        sub(`${d.customerName || "Un cliente"} ha cancelado su reserva.`),
        `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px"><tr>
          <td style="background-color:#f3ecdd;border-radius:10px;padding:14px 20px">
            <p style="font-family:${F};font-size:13px;color:#64757d;margin:0">Cliente: <strong style="color:#0f2f39">${d.customerName || ""}</strong></p>
            <p style="font-family:${F};font-size:13px;color:#64757d;margin:4px 0 0">Email: <strong style="color:#0f2f39">${d.customerEmail || ""}</strong></p>
          </td>
        </tr></table>`,
        `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px"><tr>
          <td style="background-color:#ffffff;border:1px solid #d7d0c2;border-radius:10px;padding:18px 20px">
            <p style="font-family:${F};font-size:18px;font-weight:700;color:#0f2f39;margin:0 0 4px">${d.className || "Clase"}</p>
            <p style="font-family:${F};font-size:14px;color:#64757d;margin:0">${d.classDate || ""} &middot; ${d.classTime || ""}</p>
          </td>
        </tr></table>`,
      ].join(""), false),
    };

    case "admin_new_order": return {
      subject: `Nueva venta: ${(d.total || 0).toFixed(2)}E - ${d.customerName || "Cliente"}`,
      html: emailWrap(logoDefault(), [
        heading(`Nueva venta`),
        sub(`${d.customerName || "Un cliente"} ha realizado una compra.`),
        refTag(d.orderId),
        `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px"><tr>
          <td style="background-color:#f3ecdd;border-radius:10px;padding:14px 20px">
            <p style="font-family:${F};font-size:13px;color:#64757d;margin:0">Cliente: <strong style="color:#0f2f39">${d.customerName || ""}</strong></p>
            <p style="font-family:${F};font-size:13px;color:#64757d;margin:4px 0 0">Email: <strong style="color:#0f2f39">${d.customerEmail || ""}</strong></p>
          </td>
        </tr></table>`,
        itemsTable(d.items),
        totalBar(d.total || 0),
      ].join(""), false),
    };

    default: return {
      subject: "Notificacion de Entre Olas",
      html: emailWrap(logoDefault(), [
        heading(`Hola, ${name || "surfista"}!`),
        sub(d.message || "Tienes una notificacion."),
      ].join(""), false),
    };
  }
}

/* ============================================================
   HTTP handler
   ============================================================ */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { to, type, data } = await req.json();
    if (!to || !type) {
      return new Response(JSON.stringify({ error: "Missing 'to' or 'type'" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { subject, html } = buildEmail(type, data);

    const client = new SMTPClient({
      connection: {
        hostname: SMTP_HOST,
        port: SMTP_PORT,
        tls: true,
        auth: { username: SMTP_USER, password: SMTP_PASS },
      },
    });

    await client.send({ from: FROM, to, subject, html });
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
