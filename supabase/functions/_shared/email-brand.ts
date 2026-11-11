/*
  Piezas comunes de los correos de Entre Olas (marca, bloques, codificación).
  Las usan send-email (correos transaccionales) y las funciones de Correos
  (campañas y automatizaciones), para que todos los correos se vean igual.
*/

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

// Escapa HTML (evita inyección en los emails desde el formulario de contacto)
function esc(s: any): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  ).slice(0, 2000);
}

/* Logos — imagen real (PNG, compatible con clientes de correo; AVIF no lo es) */
const LOGO_URL = "https://entreolasurf.com/images/logo.png";
function logoDefault() {
  return `<img src="${LOGO_URL}" width="92" height="92" alt="Entre Olas Surf" style="display:block;width:92px;height:92px;border:0;border-radius:14px" />`;
}

function logoCamp() {
  return `<img src="${LOGO_URL}" width="104" height="104" alt="Entre Olas Surf House" style="display:block;width:104px;height:104px;border:0;border-radius:14px" />`;
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
/* opts (solo campañas): preheader = texto de vista previa oculto;
   footerHtml = pie extra (texto legal + enlace de baja) bajo el pie navy.
   Sin opts el HTML es idéntico al de siempre. */
function emailWrap(logo: string, content: string, isCamp: boolean,
                   opts: { preheader?: string; footerHtml?: string } = {}) {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#fffdf7">${opts.preheader ? `\n<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#fffdf7">${opts.preheader}</div>` : ""}
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
${opts.footerHtml ? `
  <tr><td style="padding:16px 28px 0" align="center">${opts.footerHtml}</td></tr>
` : ""}
</table>
</td></tr></table>
</body></html>`;
}


/* El asunto viaja en una cabecera y denomailer la codifica mal cuando lleva
   acentos, guiones largos o simbolos: el correo llega con el MIME en crudo
   (=?utf-8?Q?..., --boundary, el HTML como texto). Se manda en ASCII puro; el
   cuerpo si conserva tildes porque va en el body, que si se codifica bien.
   Ya habia rastro del problema: el asunto de "Nueva venta" ponia 15.00E. */

/* El cuerpo viaja en quoted-printable y denomailer parte las lineas a 76
   caracteres. Cuando la linea lleva caracteres multibyte (—, ·, tildes) el
   corte cae mal y asoma el codigo en el correo: el famoso "=20" (un espacio)
   suelto en mitad del texto.
   Se convierte todo lo que no sea ASCII a entidades HTML (&#233; etc.): el
   mensaje viaja como ASCII puro, no hay nada que trocear, y el cliente de
   correo lo pinta con sus tildes de siempre. */
function htmlSoloAscii(html: string): string {
  return String(html ?? "").replace(/[^\x00-\x7f]/g, (c) => `&#${c.codePointAt(0)};`);
}

function asuntoSeguro(s: string): string {
  return String(s ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")   // tildes fuera
    .replace(/[\u2010-\u2015]/g, "-")                   // guiones largos
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
    .replace(/\u20ac/g, "EUR").replace(/\u00a0/g, " ")
    .replace(/[^\x20-\x7e]/g, "")                       // cualquier resto no ASCII
    .replace(/\s+/g, " ").trim()
    .slice(0, 150);                                     // cabeceras muy largas tambien se parten mal
}

export { F, FU, esc, LOGO_URL, logoDefault, logoCamp, label, btnYellow, btnNavy, itemsTable, totalBar, refTag, sandBox, heading, sub, emailWrap, htmlSoloAscii, asuntoSeguro };
