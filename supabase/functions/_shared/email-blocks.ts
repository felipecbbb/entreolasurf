/*
  Correos del panel (campañas y automatizaciones): bloques → HTML de marca.

  Bloques (email_templates.blocks / email_campaigns.blocks):
    { type: "heading", text }          título grande
    { type: "text", text }             párrafo; admite **negrita**, [texto](https://url) y saltos de línea
    { type: "image", url, alt? }       imagen a ancho completo
    { type: "button", text, url }      botón amarillo de la marca
    { type: "divider" }                línea separadora

  Variables (en asunto, preheader y cualquier texto):
    {nombre} {nombre_completo} {email} {clases_restantes} {tipo_bono} {caducidad_bono}
*/
import { F, logoDefault, btnYellow, heading, emailWrap, htmlSoloAscii } from "./email-brand.ts";

// Escape sin recorte (el esc() de email-brand corta a 2000 caracteres para el
// formulario de contacto; aquí un párrafo de campaña puede ser más largo).
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

export type Block =
  | { type: "heading"; text: string }
  | { type: "text"; text: string }
  | { type: "image"; url: string; alt?: string }
  | { type: "button"; text: string; url: string }
  | { type: "divider" };

export type Vars = Record<string, string | number | null | undefined>;

export const VARIABLES = [
  "nombre", "nombre_completo", "email", "clases_restantes", "tipo_bono", "caducidad_bono",
] as const;

const CLASS_LABEL: Record<string, string> = {
  grupal: "surf en grupo",
  individual: "surf individual",
  yoga: "yoga",
  paddle: "paddle surf",
  surfskate: "surfskate",
};

/* Sustituye {variable}. Las desconocidas se dejan tal cual (así se ven en la
   vista previa); las conocidas sin valor quedan vacías. */
export function fillVars(text: string, vars: Vars): string {
  return String(text ?? "").replace(/\{([a-z_]+)\}/g, (m, k) =>
    (VARIABLES as readonly string[]).includes(k) ? String(vars[k] ?? "") : m);
}

const safeUrl = (u: string) => /^(https?:\/\/|mailto:|tel:)/i.test(String(u || "").trim()) ? String(u).trim() : "";

/* Formato ligero sobre texto YA escapado: **negrita**, [texto](url), saltos. */
function inline(text: string): string {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, url) => {
      const u = safeUrl(url.replace(/&amp;/g, "&"));
      return u ? `<a href="${esc(u)}" style="color:#0f2f39;font-weight:700">${label}</a>` : label;
    })
    .replace(/\n/g, "<br>");
}

function block(b: Block, vars: Vars): string {
  switch (b?.type) {
    case "heading":
      return heading(esc(fillVars(b.text, vars)));
    case "text":
      return `<p style="font-family:${F};font-size:15px;color:#2d3d45;margin:0 0 16px;line-height:1.6">${inline(fillVars(b.text, vars))}</p>`;
    case "image": {
      const u = safeUrl(b.url);
      return u ? `<img src="${esc(u)}" alt="${esc(b.alt || "")}" width="484" style="display:block;width:100%;max-width:484px;height:auto;border:0;border-radius:10px;margin:8px 0 18px">` : "";
    }
    case "button": {
      const u = safeUrl(fillVars(b.url, vars));
      return u ? btnYellow(esc(fillVars(b.text, vars)), esc(u)) : "";
    }
    case "divider":
      return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0"><tr><td style="border-top:1px solid #d7d0c2;font-size:0;line-height:0">&nbsp;</td></tr></table>`;
    default:
      return "";
  }
}

export function renderEmail(opts: {
  blocks: Block[];
  vars: Vars;
  preheader?: string | null;
  footerText?: string | null;
  unsubscribeUrl?: string | null;
}): string {
  const content = (Array.isArray(opts.blocks) ? opts.blocks : []).map((b) => block(b, opts.vars)).join("");
  const footerHtml = [
    opts.footerText ? esc(opts.footerText) : "",
    opts.unsubscribeUrl
      ? `<a href="${esc(opts.unsubscribeUrl)}" style="color:#64757d;text-decoration:underline">Darme de baja de estos correos</a>`
      : "",
  ].filter(Boolean).join("<br>");
  const html = emailWrap(logoDefault(), content, false, {
    preheader: opts.preheader ? esc(fillVars(opts.preheader, opts.vars)) : "",
    footerHtml: footerHtml
      ? `<p style="font-family:${F};font-size:11px;color:#64757d;margin:0;line-height:1.6">${footerHtml}</p>`
      : "",
  });
  return htmlSoloAscii(html);
}

/* Variables de un cliente a partir de su perfil y sus bonos. El bono de
   referencia es el activo con clases sin usar que antes caduca. */
export function varsFor(profile: { full_name?: string | null; last_name?: string | null; email?: string | null },
                        bonos: Array<{ class_type: string; total_credits: number; used_credits: number; expires_at: string; status: string }> = []): Vars {
  const full = [profile.full_name, profile.last_name].filter(Boolean).join(" ").trim();
  const now = Date.now();
  const live = bonos
    .filter((b) => b.status === "active" && new Date(b.expires_at).getTime() > now && b.total_credits > b.used_credits)
    .sort((a, b) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime());
  const bono = live[0];
  return {
    nombre: (profile.full_name || "").trim().split(/\s+/)[0] || "",
    nombre_completo: full,
    email: profile.email || "",
    clases_restantes: bono ? bono.total_credits - bono.used_credits : "",
    tipo_bono: bono ? (CLASS_LABEL[bono.class_type] || bono.class_type) : "",
    caducidad_bono: bono
      ? new Date(bono.expires_at).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" })
      : "",
  };
}

/* Datos de ejemplo para la vista previa cuando no hay cliente real. */
export const SAMPLE_VARS: Vars = {
  nombre: "Lucía",
  nombre_completo: "Lucía García",
  email: "lucia@ejemplo.com",
  clases_restantes: 3,
  tipo_bono: "surf en grupo",
  caducidad_bono: "30 de junio de 2027",
};
