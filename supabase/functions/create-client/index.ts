import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function translateAuthError(msg: string | undefined): string {
  if (!msg) return "No se pudo crear el cliente";
  const m = msg.toLowerCase();
  if (m.includes("already") && m.includes("regist")) return "Ya hay una cuenta con ese email";
  if (m.includes("already exists")) return "Ya hay una cuenta con ese email";
  if (m.includes("invalid email") || m.includes("invalid format")) return "El email no es válido";
  return msg;
}

// Convierte 'true'/'false'/true/false/'' a boolean|null sin reventar
function toBool(v: unknown): boolean | null {
  if (v === true || v === "true") return true;
  if (v === false || v === "false") return false;
  return null;
}
function clean(v: unknown): string | null {
  const s = (v ?? "").toString().trim();
  return s || null;
}

// Contraseña aleatoria legible (sin caracteres ambiguos) con may/min/díg/símbolo
function genPassword(len = 12): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digit = "23456789";
  const sym = "!@#$%*?";
  const all = upper + lower + digit + sym;
  const rnd = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  const pick = (set: string) => set[rnd(set.length)];
  const chars = [pick(upper), pick(lower), pick(digit), pick(sym)];
  while (chars.length < len) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) { const j = rnd(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join("");
}

// Busca un usuario de auth por email paginando (listUsers trae 50/página por defecto)
async function findAuthUserByEmail(supabase: any, email: string) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 40; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return null;
    const found = data.users.find((u: any) => (u.email || "").toLowerCase() === target);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!authHeader) return json({ error: "No autorizado" }, 401);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1) El que llama debe ser staff (admin o encargado)
    const { data: { user }, error: userErr } = await supabase.auth.getUser(authHeader);
    if (userErr || !user) return json({ error: "Sesión inválida" }, 401);
    const { data: callerProfile } = await supabase
      .from("profiles").select("role").eq("id", user.id).single();
    if (!callerProfile || !["admin", "encargado"].includes(callerProfile.role)) {
      return json({ error: "Sin permisos para crear clientes" }, 403);
    }

    // 2) Datos del cliente
    const body = await req.json();
    const emailRaw = clean(body.email);
    const email = emailRaw ? emailRaw.toLowerCase() : null;
    const full_name = clean(body.full_name);
    if (!email) return json({ error: "El email es obligatorio" }, 400);
    if (!full_name) return json({ error: "El nombre es obligatorio" }, 400);

    const siteUrl = Deno.env.get("SITE_URL") || "https://entreolasurf.com";

    // 3) ¿El email ya tiene cuenta? → reutilizar SIN duplicar ni enviar correo.
    //    ilike = insensible a mayúsculas (cubre datos antiguos guardados con may.).
    const { data: existingRows } = await supabase
      .from("profiles").select("id").ilike("email", email).limit(1);
    if (existingRows?.[0]) {
      return json({ ok: true, user_id: existingRows[0].id, already_existed: true, email_sent: false });
    }

    // 4) Crear la cuenta con una contraseña ALEATORIA (se enviará por correo).
    const password = genPassword(12);
    let created: any = null, createErr: any = null;
    ({ data: created, error: createErr } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name },
    }));
    if (createErr || !created?.user) {
      // Puede existir en auth sin fila en profiles (cuenta huérfana): buscar paginando y reutilizar sin correo.
      const m = (createErr?.message || "").toLowerCase();
      if (m.includes("already") || m.includes("regist") || m.includes("exist")) {
        const found = await findAuthUserByEmail(supabase, email);
        if (found) return json({ ok: true, user_id: found.id, already_existed: true, email_sent: false });
      }
      return json({ error: translateAuthError(createErr?.message) }, 400);
    }
    const userId = created.user.id;

    // 5) Perfil completo (la fila puede existir por trigger → upsert). must_change_password
    //    fuerza el cambio de contraseña en el primer acceso del cliente.
    const { error: profErr } = await supabase.from("profiles").upsert({
      id: userId,
      full_name,
      last_name: clean(body.last_name),
      email,
      phone: clean(body.phone),
      birth_date: clean(body.birth_date),
      address: clean(body.address),
      city: clean(body.city),
      postal_code: clean(body.postal_code),
      level: clean(body.level),
      wetsuit_size: clean(body.wetsuit_size),
      can_swim: toBool(body.can_swim),
      has_injury: toBool(body.has_injury) === true,
      injury_detail: clean(body.injury_detail),
      role: "client",
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (profErr) {
      await supabase.auth.admin.deleteUser(userId);
      return json({ error: `Perfil: ${profErr.message}` }, 500);
    }

    // Forzar cambio de contraseña en el primer acceso. UPDATE aparte y tolerante:
    // si la columna aún no existe (migración sin aplicar) el error se ignora y el alta no se bloquea.
    await supabase.from("profiles").update({ must_change_password: true }).eq("id", userId);

    // 6) Familiares (opcional)
    let familyCreated = 0;
    const family = Array.isArray(body.family) ? body.family : [];
    for (const f of family) {
      const fn = clean(f.full_name);
      if (!fn) continue;
      const { error: fErr } = await supabase.from("family_members").insert({
        user_id: userId,
        full_name: fn,
        last_name: clean(f.last_name),
        birth_date: clean(f.birth_date),
        level: clean(f.level),
        wetsuit_size: clean(f.wetsuit_size),
        can_swim: toBool(f.can_swim),
        has_injury: toBool(f.has_injury) === true,
        injury_detail: clean(f.injury_detail),
      });
      if (!fErr) familyCreated++;
    }

    // 7) Enviar el correo con usuario + contraseña (no bloqueante).
    let emailSent = false;
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
        body: JSON.stringify({
          to: email, type: "new_account",
          data: { customerName: full_name, email, password, loginUrl: `${siteUrl}/mi-cuenta/` },
        }),
      });
      emailSent = resp.ok;
    } catch (_) { emailSent = false; }

    return json({ ok: true, user_id: userId, family_created: familyCreated, already_existed: false, email_sent: emailSent });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
});
