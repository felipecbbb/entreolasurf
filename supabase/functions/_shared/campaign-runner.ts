/*
  Motor de envío de campañas, compartido por email-campaign (envío desde el
  panel) y email-dispatch (campañas programadas, vía cron).

  1. materialize(): resuelve el segmento (función SQL email_segment, fuente
     única) y crea una fila 'queued' en email_sends por destinatario.
  2. processQueued(): envía las 'queued' por lotes con un presupuesto de tiempo.
     Se puede llamar las veces que haga falta: solo toca las que siguen en cola,
     así que si una ejecución se corta, la siguiente continúa donde quedó.
*/
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { renderEmail, varsFor, fillVars, type Block, type Vars } from "./email-blocks.ts";
import { sendBrevo, pool } from "./brevo.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

export type Settings = {
  sender: { name: string; email: string };
  replyTo: string | null;
  footer: string | null;
};

export async function loadSettings(sb: SupabaseClient): Promise<Settings> {
  const { data, error } = await sb.from("site_settings")
    .select("email_sender_name, email_sender_address, email_reply_to, email_footer")
    .eq("id", 1).maybeSingle();
  if (error) throw new Error("ajustes: " + error.message);
  if (!data?.email_sender_address) {
    throw new Error("Falta el correo del remitente: configúralo en Correos → Ajustes.");
  }
  return {
    sender: { name: data.email_sender_name || "Entre Olas Surf", email: data.email_sender_address },
    replyTo: data.email_reply_to || null,
    footer: data.email_footer || null,
  };
}

export const unsubscribeUrl = (token: string) =>
  `${SUPABASE_URL}/functions/v1/email-unsubscribe?t=${encodeURIComponent(token)}`;

export async function segmentIds(sb: SupabaseClient, segment: unknown): Promise<string[]> {
  const { data, error } = await sb.rpc("email_segment", { segment: segment || {} });
  if (error) throw new Error("segmento: " + error.message);
  return (data || []).map((r: any) => r.profile_id);
}

export async function materialize(sb: SupabaseClient, campaignId: string) {
  const { data: c, error } = await sb.from("email_campaigns").select("*").eq("id", campaignId).single();
  if (error || !c) throw new Error("campaña no encontrada");
  if (!["draft", "scheduled"].includes(c.status)) return c; // ya en marcha o enviada

  const ids = await segmentIds(sb, c.segment);
  if (!ids.length) throw new Error("El segmento no tiene destinatarios.");
  const { data: profiles, error: pe } = await sb.from("profiles").select("id, email").in("id", ids);
  if (pe) throw new Error(pe.message);

  // Pasa a 'sending' solo si sigue en draft/scheduled (evita doble envío por doble clic)
  const { data: locked } = await sb.from("email_campaigns")
    .update({ status: "sending", recipients: profiles!.length, updated_at: new Date().toISOString() })
    .eq("id", campaignId).in("status", ["draft", "scheduled"]).select("id");
  if (!locked?.length) return c;

  const rows = profiles!.map((p) => ({ campaign_id: campaignId, profile_id: p.id, email: p.email, status: "queued" }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error: ie } = await sb.from("email_sends").insert(rows.slice(i, i + 500));
    if (ie) throw new Error("cola: " + ie.message);
  }
  return { ...c, status: "sending" };
}

export async function processQueued(sb: SupabaseClient, campaignId: string, apiKey: string, budgetMs = 90_000) {
  const t0 = Date.now();
  const { data: c, error } = await sb.from("email_campaigns").select("*").eq("id", campaignId).single();
  if (error || !c) throw new Error("campaña no encontrada");
  if (c.status !== "sending") return { remaining: 0, status: c.status };
  const settings = await loadSettings(sb);

  let sent = 0, failed = 0;
  while (Date.now() - t0 < budgetMs) {
    const { data: queue } = await sb.from("email_sends")
      .select("id, profile_id, email").eq("campaign_id", campaignId).eq("status", "queued").limit(40);
    if (!queue?.length) break;

    const pids = queue.map((q) => q.profile_id).filter(Boolean);
    const [{ data: profs }, { data: bonos }] = await Promise.all([
      sb.from("profiles").select("id, full_name, last_name, email, email_unsub_token, email_unsubscribed_at").in("id", pids),
      sb.from("bonos").select("user_id, class_type, total_credits, used_credits, expires_at, status").in("user_id", pids),
    ]);
    const pmap = new Map((profs || []).map((p) => [p.id, p]));

    await pool(queue, 5, async (q) => {
      const p: any = pmap.get(q.profile_id);
      if (!p || p.email_unsubscribed_at) {
        await sb.from("email_sends").update({ status: "failed", error: "dado de baja" }).eq("id", q.id);
        failed++; return;
      }
      const vars = varsFor(p, (bonos || []).filter((b) => b.user_id === p.id));
      const unsub = unsubscribeUrl(p.email_unsub_token);
      try {
        const html = renderEmail({ blocks: c.blocks as Block[], vars, preheader: c.preheader, footerText: settings.footer, unsubscribeUrl: unsub });
        const { messageId } = await sendBrevo(apiKey, {
          sender: settings.sender, to: { email: q.email, name: vars.nombre_completo as string },
          subject: renderSubject(c.subject, vars), html, replyTo: settings.replyTo,
          unsubscribeUrl: unsub, tags: ["campaign", campaignId],
        });
        await sb.from("email_sends").update({ status: "sent", brevo_message_id: messageId, sent_at: new Date().toISOString() }).eq("id", q.id);
        sent++;
      } catch (e: any) {
        await sb.from("email_sends").update({ status: "failed", error: String(e.message).slice(0, 500) }).eq("id", q.id);
        failed++;
      }
    });
  }

  // Recuento real desde la tabla (no depende de esta ejecución)
  const count = async (st: string[]) => (await sb.from("email_sends").select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId).in("status", st)).count || 0;
  const [remaining, okN, failN] = await Promise.all([
    count(["queued"]), count(["sent", "delivered", "opened", "clicked"]), count(["failed", "bounced"]),
  ]);
  const done = remaining === 0;
  await sb.from("email_campaigns").update({
    sent_count: okN, failed_count: failN, updated_at: new Date().toISOString(),
    ...(done ? { status: okN > 0 ? "sent" : "failed", sent_at: new Date().toISOString() } : {}),
  }).eq("id", campaignId);
  return { remaining, sent_now: sent, failed_now: failed, sent_total: okN, failed_total: failN, status: done ? (okN > 0 ? "sent" : "failed") : "sending" };
}

export const renderSubject = (s: string, vars: Vars) => fillVars(s, vars).replace(/\s+/g, " ").trim().slice(0, 200);
