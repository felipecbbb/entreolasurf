/*
  bono-reminders — avisos automáticos por correo a clientes con bono.

  La llama pg_cron una vez al día (ver supabase/migration-bono-reminders.sql).
  Se despliega con --no-verify-jwt y se protege con la cabecera x-cron-secret
  (= secreto CRON_SECRET de la función).

  Qué manda (solo bonos 'active', no caducados, con clases sin asignar):
    · expira_30  → caduca en ≤30 días. Una vez por fecha de caducidad.
    · expira_7   → caduca en ≤7 días. Una vez por fecha de caducidad.
    (El aviso "pendiente" —clases sin reservar— se quitó el 2026-11-11 a
     petición del cliente; la plantilla bono_pending sigue en send-email.)
  Cada envío queda en public.bono_reminders (sirve de anti-duplicados e
  histórico). Body {"dry_run": true} → devuelve la lista sin enviar nada.
*/
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

const MAX_EMAILS_PER_RUN = 60;      // el resto sale al día siguiente (límite SMTP / tiempo)
const DAY = 86_400_000;

const CLASS_LABEL: Record<string, string> = {
  grupal: "surf en grupo",
  individual: "surf individual",
  yoga: "yoga",
  paddle: "paddle surf",
  surfskate: "surfskate",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Fecha legible en hora de Madrid: "12 de diciembre de 2027"
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid",
  });
}
// Día natural (YYYY-MM-DD) en Madrid, para claves anti-duplicado
function madridDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
}
const isEmail = (s: unknown) => typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }
  let dryRun = false;
  try { dryRun = !!(await req.json())?.dry_run; } catch { /* sin body */ }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  // 1) Bonos vivos con clases sin asignar
  const { data: bonos, error: e1 } = await sb
    .from("bonos")
    .select("id, user_id, class_type, total_credits, used_credits, expires_at, created_at")
    .eq("status", "active")
    .gt("expires_at", nowIso);
  if (e1) return json({ error: "bonos: " + e1.message }, 500);
  const live = (bonos || []).filter((b) => b.total_credits - b.used_credits > 0);
  if (!live.length) return json({ dry_run: dryRun, sent: 0, candidates: [] });

  const bonoIds = live.map((b) => b.id);
  const userIds = [...new Set(live.map((b) => b.user_id))];

  // 2) Datos de contacto e historial de avisos
  const [profilesRes, sentRes] = await Promise.all([
    sb.from("profiles").select("id, full_name, email").in("id", userIds),
    sb.from("bono_reminders").select("bono_id, kind, ref_date, sent_at").in("bono_id", bonoIds),
  ]);
  for (const r of [profilesRes, sentRes]) {
    if (r.error) return json({ error: r.error.message }, 500);
  }

  const profile = new Map((profilesRes.data || []).map((p) => [p.id, p]));
  const sent = sentRes.data || [];

  // 3) Decidir qué aviso toca a cada bono (como mucho uno por bono y día)
  type Job = { bono_id: string; kind: string; ref_date: string | null; email: string; data: any };
  const jobs: Job[] = [];
  const skipped: any[] = [];

  for (const b of live) {
    const p = profile.get(b.user_id);
    if (!isEmail(p?.email)) { skipped.push({ bono_id: b.id, reason: "sin email" }); continue; }

    const remaining = b.total_credits - b.used_credits;
    const daysLeft = Math.ceil((new Date(b.expires_at).getTime() - now) / DAY);
    const expDay = madridDay(b.expires_at);
    const already = (kind: string, ref: string | null) =>
      sent.some((s) => s.bono_id === b.id && s.kind === kind && (ref === null || s.ref_date === ref));

    let kind: string | null = null;
    let ref: string | null = null;
    if (daysLeft <= 7) {
      if (!already("expira_7", expDay)) { kind = "expira_7"; ref = expDay; }
    } else if (daysLeft <= 30) {
      if (!already("expira_30", expDay)) { kind = "expira_30"; ref = expDay; }
    }
    if (!kind) continue;

    const firstName = (p!.full_name || "").trim().split(/\s+/)[0] || "";
    jobs.push({
      bono_id: b.id, kind, ref_date: ref, email: p!.email,
      data: {
        customerName: firstName,
        remaining,
        daysLeft,
        classLabel: CLASS_LABEL[b.class_type] || b.class_type,
        expiresDate: fmtDate(b.expires_at),
      },
    });
  }

  // Lo más urgente primero, por si se corta en MAX_EMAILS_PER_RUN
  const prio: Record<string, number> = { expira_7: 0, expira_30: 1 };
  jobs.sort((a, b) => prio[a.kind] - prio[b.kind]);
  const batch = jobs.slice(0, MAX_EMAILS_PER_RUN);

  if (dryRun) {
    return json({
      dry_run: true,
      would_send: batch.map(({ data, ...j }) => ({ ...j, ...data })),
      deferred: jobs.length - batch.length,
      skipped,
    });
  }

  // 4) Enviar y registrar (registro solo si el SMTP aceptó)
  const results: any[] = [];
  for (const j of batch) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({
          to: j.email,
          type: "bono_expiring",
          data: j.data,
        }),
      });
      if (!res.ok) throw new Error(`send-email ${res.status}: ${await res.text()}`);
      const { error } = await sb.from("bono_reminders").insert({
        bono_id: j.bono_id, kind: j.kind, ref_date: j.ref_date, email: j.email,
      });
      if (error) console.error("bono_reminders insert", j.bono_id, error.message);
      results.push({ bono_id: j.bono_id, kind: j.kind, ok: true });
    } catch (err: any) {
      console.error("bono-reminders send", j.bono_id, err.message);
      results.push({ bono_id: j.bono_id, kind: j.kind, ok: false, error: err.message });
    }
  }

  return json({
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    deferred: jobs.length - batch.length,
    skipped: skipped.length,
    results,
  });
});
