/*
  email-campaign — API del apartado «Correos» del panel. Solo admin estricto.

  POST { action, ... }:
    preview  { blocks, subject, preheader, profile_id? } → { subject, html }
    count    { segment }                                  → { count, sample[] }
    test     { blocks, subject, preheader, to }           → envía una prueba (con datos de ejemplo)
    send     { campaign_id }                              → pone en cola y empieza a enviar
    process  { campaign_id }                              → sigue enviando lo que quede en cola
  Los envíos van por Brevo (secret BREVO_API_KEY).
*/
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { renderEmail, varsFor, SAMPLE_VARS, type Block } from "../_shared/email-blocks.ts";
import { sendBrevo } from "../_shared/brevo.ts";
import {
  loadSettings, materialize, processQueued, segmentIds, renderSubject, unsubscribeUrl,
} from "../_shared/campaign-runner.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const isEmail = (s: unknown) => typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Solo admin estricto: sin esto sería un relé de correo abierto.
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = await sb.auth.getUser(jwt);
  if (!u?.user) return json({ error: "no autenticado" }, 401);
  const { data: me } = await sb.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
  if (me?.role !== "admin") return json({ error: "solo administradores" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }

  try {
    switch (body.action) {
      case "preview": {
        let vars = SAMPLE_VARS;
        if (body.profile_id) {
          const [{ data: p }, { data: bonos }] = await Promise.all([
            sb.from("profiles").select("full_name, last_name, email").eq("id", body.profile_id).maybeSingle(),
            sb.from("bonos").select("class_type, total_credits, used_credits, expires_at, status").eq("user_id", body.profile_id),
          ]);
          if (p) vars = varsFor(p, bonos || []);
        }
        const { data: s } = await sb.from("site_settings").select("email_footer").eq("id", 1).maybeSingle();
        return json({
          subject: renderSubject(body.subject || "", vars),
          html: renderEmail({
            blocks: (body.blocks || []) as Block[], vars, preheader: body.preheader,
            footerText: s?.email_footer, unsubscribeUrl: "https://entreolasurf.com/#baja",
          }),
        });
      }

      case "count": {
        const ids = await segmentIds(sb, body.segment || {});
        const { data: sample } = ids.length
          ? await sb.from("profiles").select("id, full_name, last_name, email").in("id", ids.slice(0, 200)).order("full_name")
          : { data: [] };
        return json({ count: ids.length, sample: sample || [] });
      }

      case "test": {
        if (!BREVO_API_KEY) return json({ error: "Falta configurar BREVO_API_KEY en Supabase." }, 400);
        if (!isEmail(body.to)) return json({ error: "Correo de prueba no válido" }, 400);
        const settings = await loadSettings(sb);
        const { messageId } = await sendBrevo(BREVO_API_KEY, {
          sender: settings.sender, to: { email: body.to },
          subject: "[PRUEBA] " + renderSubject(body.subject || "", SAMPLE_VARS),
          html: renderEmail({
            blocks: (body.blocks || []) as Block[], vars: SAMPLE_VARS, preheader: body.preheader,
            footerText: settings.footer, unsubscribeUrl: unsubscribeUrl("prueba"),
          }),
          replyTo: settings.replyTo, tags: ["test"],
        });
        return json({ ok: true, messageId });
      }

      case "send": {
        if (!BREVO_API_KEY) return json({ error: "Falta configurar BREVO_API_KEY en Supabase." }, 400);
        await loadSettings(sb); // falla pronto si no hay remitente
        await materialize(sb, body.campaign_id);
        return json(await processQueued(sb, body.campaign_id, BREVO_API_KEY, 60_000));
      }

      case "process": {
        if (!BREVO_API_KEY) return json({ error: "Falta configurar BREVO_API_KEY en Supabase." }, 400);
        return json(await processQueued(sb, body.campaign_id, BREVO_API_KEY, 60_000));
      }

      default:
        return json({ error: "acción desconocida" }, 400);
    }
  } catch (e: any) {
    console.error("email-campaign", body?.action, e);
    return json({ error: e.message || String(e) }, 500);
  }
});
