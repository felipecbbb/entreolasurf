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
    const email = clean(body.email);
    const full_name = clean(body.full_name);
    if (!email) return json({ error: "El email es obligatorio" }, 400);
    if (!full_name) return json({ error: "El nombre es obligatorio" }, 400);

    // 3) Crear usuario (email confirmado; el cliente puede fijar su contraseña
    //    desde "He olvidado mi contraseña"). NO toca la sesión de quien llama.
    const tempPassword = crypto.randomUUID() + "Aa1!";
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (createErr || !created.user) return json({ error: translateAuthError(createErr?.message) }, 400);
    const userId = created.user.id;

    // 4) Perfil completo (la fila puede existir por trigger → upsert)
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

    // 5) Familiares (opcional)
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

    return json({ ok: true, user_id: userId, family_created: familyCreated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
});
