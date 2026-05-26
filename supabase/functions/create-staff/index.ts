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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!authHeader) return json({ error: "No autorizado" }, 401);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1) Verify caller is strict admin
    const { data: { user }, error: userErr } = await supabase.auth.getUser(authHeader);
    if (userErr || !user) return json({ error: "Sesión inválida" }, 401);

    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!callerProfile || callerProfile.role !== "admin") {
      return json({ error: "Solo el admin puede crear encargados" }, 403);
    }

    // 2) Parse payload
    const { email, password, full_name } = await req.json();
    if (!email || !password || !full_name) {
      return json({ error: "Faltan campos: email, password, full_name" }, 400);
    }
    if (password.length < 8) {
      return json({ error: "La contraseña debe tener al menos 8 caracteres" }, 400);
    }

    // 3) Create user (email_confirm=true to skip verification email)
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (createErr || !created.user) {
      return json({ error: createErr?.message || "No se pudo crear usuario" }, 400);
    }

    // 4) Upsert profile with role='encargado'. A trigger may have already
    //    created a default row, so we update it explicitly.
    const { error: profErr } = await supabase
      .from("profiles")
      .upsert({
        id: created.user.id,
        full_name,
        email,
        role: "encargado",
      }, { onConflict: "id" });

    if (profErr) {
      // Roll back the auth user so we don't leave dangling accounts
      await supabase.auth.admin.deleteUser(created.user.id);
      return json({ error: `Perfil: ${profErr.message}` }, 500);
    }

    return json({ ok: true, user_id: created.user.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
});
