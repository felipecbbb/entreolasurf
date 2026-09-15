-- ============================================================
-- Lista de espera de clases + ajustes del sitio
-- ------------------------------------------------------------
-- Cuando no hay ninguna clase disponible, la web deja de ser un
-- callejón sin salida: se ofrece dejar los datos para avisar en cuanto
-- se publiquen fechas nuevas. El admin lo enciende/apaga desde Ajustes.
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

-- ---- 1) Ajustes del sitio (fila única, como payroll_config) ----
CREATE TABLE IF NOT EXISTS public.site_settings (
  id                 integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  waitlist_enabled   boolean NOT NULL DEFAULT true,
  waitlist_title     text,
  waitlist_text      text,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.site_settings (id, waitlist_enabled)
VALUES (1, true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- La web pública necesita leer el interruptor antes de pintar el cuadro
DROP POLICY IF EXISTS "Public read settings" ON public.site_settings;
CREATE POLICY "Public read settings" ON public.site_settings
  FOR SELECT USING (true);

-- Escribir los ajustes del sitio: solo role='admin'. Un encargado con
-- allowed_sections NULL pasaría enc_can() sin tener nunca esa sección en el
-- menú, así que aquí se usa el helper estricto.
DROP POLICY IF EXISTS "Staff manage settings" ON public.site_settings;
DROP POLICY IF EXISTS "Admin manage settings" ON public.site_settings;
CREATE POLICY "Admin manage settings" ON public.site_settings
  FOR ALL USING (public.is_strict_admin())
  WITH CHECK (public.is_strict_admin());

-- ---- 2) Lista de espera ----
CREATE TABLE IF NOT EXISTS public.class_waitlist (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  name            text NOT NULL,
  email           text NOT NULL,
  phone           text,
  -- '' = "cualquier clase". Se evita NULL a propósito: la clave única de
  -- abajo debe ser de columnas planas para que el upsert de PostgREST la use.
  class_type      text NOT NULL DEFAULT '',
  wants_whatsapp  boolean NOT NULL DEFAULT true,
  source          text NOT NULL DEFAULT 'class-picker',
  notified_at     timestamptz,   -- cuándo se le avisó (lo marca el admin)
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Una persona no debe aparecer dos veces para el mismo tipo de clase.
-- Restricción de columnas planas (no un índice de expresión) porque el upsert
-- del cliente la nombra en ON CONFLICT; el email se guarda ya en minúsculas.
ALTER TABLE public.class_waitlist
  DROP CONSTRAINT IF EXISTS class_waitlist_unico;
ALTER TABLE public.class_waitlist
  ADD CONSTRAINT class_waitlist_unico UNIQUE (email, class_type);

CREATE INDEX IF NOT EXISTS class_waitlist_creado
  ON public.class_waitlist (created_at DESC);

ALTER TABLE public.class_waitlist ENABLE ROW LEVEL SECURITY;

-- Cualquiera puede apuntarse (el formulario vive en la web pública)
DROP POLICY IF EXISTS "Anyone joins waitlist" ON public.class_waitlist;
CREATE POLICY "Anyone joins waitlist" ON public.class_waitlist
  FOR INSERT WITH CHECK (true);

-- Leerla y gestionarla, solo el staff con la sección concedida
DROP POLICY IF EXISTS "Staff manage waitlist" ON public.class_waitlist;
CREATE POLICY "Staff manage waitlist" ON public.class_waitlist
  FOR SELECT USING (public.enc_can(ARRAY['lista-espera']));

DROP POLICY IF EXISTS "Staff update waitlist" ON public.class_waitlist;
CREATE POLICY "Staff update waitlist" ON public.class_waitlist
  FOR UPDATE USING (public.enc_can(ARRAY['lista-espera']))
  WITH CHECK (public.enc_can(ARRAY['lista-espera']));

DROP POLICY IF EXISTS "Staff delete waitlist" ON public.class_waitlist;
CREATE POLICY "Staff delete waitlist" ON public.class_waitlist
  FOR DELETE USING (public.enc_can(ARRAY['lista-espera']));

-- Recargar caché de PostgREST para que las tablas nuevas se vean ya
SELECT pg_notify('pgrst', 'reload schema');
