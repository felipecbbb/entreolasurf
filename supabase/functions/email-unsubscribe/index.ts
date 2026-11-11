/*
  email-unsubscribe — enlace «Darme de baja» de los correos del panel.
  Público (verify_jwt = false). El token es profiles.email_unsub_token.
    GET  ?t=token  → marca la baja y muestra una página de confirmación
    POST ?t=token  → baja en un clic (cabecera List-Unsubscribe-Post de Gmail/Apple)
  Repetirlo no pasa nada: conserva la fecha de la primera baja.
*/
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function page(title: string, text: string, status = 200) {
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Entre Olas Surf</title>
<meta name="robots" content="noindex"></head>
<body style="margin:0;background:#fffdf7;font-family:Helvetica,Arial,sans-serif;color:#2d3d45">
<div style="max-width:480px;margin:48px auto;padding:0 16px">
  <div style="background:#f3ecdd;border-radius:18px 18px 0 0;padding:20px;text-align:center">
    <img src="https://entreolasurf.com/images/logo.png" width="80" height="80" alt="Entre Olas Surf" style="border-radius:14px">
  </div>
  <div style="height:3px;background:#FFCC01"></div>
  <div style="background:#fff;border-radius:0 0 18px 18px;padding:28px">
    <h1 style="font-size:22px;color:#0f2f39;margin:0 0 10px">${title}</h1>
    <p style="font-size:15px;line-height:1.6;margin:0">${text}</p>
    <p style="margin:24px 0 0"><a href="https://entreolasurf.com/" style="color:#0f2f39;font-weight:700">Ir a la web</a></p>
  </div>
</div></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

Deno.serve(async (req) => {
  const t = new URL(req.url).searchParams.get("t") || "";
  if (!UUID.test(t)) return page("Enlace no válido", "Este enlace de baja no es correcto o está incompleto.", 400);

  const { data: p, error } = await sb.from("profiles")
    .select("id, email_unsubscribed_at").eq("email_unsub_token", t).maybeSingle();
  if (error) return page("Algo ha fallado", "No hemos podido procesar la baja. Inténtalo de nuevo en un rato.", 500);
  if (!p) return page("Enlace no válido", "No encontramos ninguna suscripción con este enlace.", 404);

  if (!p.email_unsubscribed_at) {
    const { error: ue } = await sb.from("profiles")
      .update({ email_unsubscribed_at: new Date().toISOString() }).eq("id", p.id);
    if (ue) return page("Algo ha fallado", "No hemos podido procesar la baja. Inténtalo de nuevo en un rato.", 500);
  }
  if (req.method === "POST") return new Response("ok");
  return page("Te has dado de baja",
    "Ya no te enviaremos correos de novedades ni promociones. Seguirás recibiendo los correos de tus reservas y compras.");
});
