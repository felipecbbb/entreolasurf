-- ============================================================
-- Apartado «Correos» del panel (email marketing vía Brevo)
-- Plantillas, campañas con segmentos, automatizaciones, historial y bajas.
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- Acceso: solo admin estricto (is_strict_admin), no encargados.
-- ============================================================

-- 1) Bajas de correo en el perfil ------------------------------------------
alter table public.profiles add column if not exists email_unsubscribed_at timestamptz;
alter table public.profiles add column if not exists email_unsub_token uuid default gen_random_uuid();
alter table public.profiles add column if not exists marketing_optout_at_signup boolean;
update public.profiles set email_unsub_token = gen_random_uuid() where email_unsub_token is null;
create unique index if not exists profiles_email_unsub_token_idx on public.profiles (email_unsub_token);

-- 2) Ajustes del remitente (fila única de site_settings) --------------------
alter table public.site_settings add column if not exists email_sender_name text default 'Entre Olas Surf';
alter table public.site_settings add column if not exists email_sender_address text;
alter table public.site_settings add column if not exists email_reply_to text default 'entreolasurf@gmail.com';
alter table public.site_settings add column if not exists email_footer text
  default 'Recibes este correo porque eres cliente de Entre Olas Surf.';

-- 3) Plantillas -------------------------------------------------------------
create table if not exists public.email_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  subject     text not null default '',
  preheader   text,
  blocks      jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 4) Campañas (envíos masivos) ---------------------------------------------
create table if not exists public.email_campaigns (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  template_id   uuid references public.email_templates(id) on delete set null,
  subject       text not null default '',
  preheader     text,
  blocks        jsonb not null default '[]'::jsonb,
  segment       jsonb not null default '{}'::jsonb,
  status        text not null default 'draft'
                  check (status in ('draft','scheduled','sending','sent','failed')),
  scheduled_at  timestamptz,
  sent_at       timestamptz,
  recipients    int not null default 0,
  sent_count    int not null default 0,
  failed_count  int not null default 0,
  last_error    text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 5) Automatizaciones -------------------------------------------------------
create table if not exists public.email_automations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  trigger      text not null
                 check (trigger in ('bono_caduca','bienvenida','tras_primera_clase','sin_actividad','cumpleanos')),
  config       jsonb not null default '{}'::jsonb,
  template_id  uuid references public.email_templates(id) on delete set null,
  active       boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 6) Historial de envíos ----------------------------------------------------
create table if not exists public.email_sends (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid references public.email_campaigns(id) on delete cascade,
  automation_id     uuid references public.email_automations(id) on delete cascade,
  profile_id        uuid references public.profiles(id) on delete set null,
  email             text not null,
  ref               text,                 -- clave anti-duplicado de automatizaciones
  status            text not null default 'queued'
                      check (status in ('queued','sent','delivered','opened','clicked','bounced','failed')),
  brevo_message_id  text,
  error             text,
  sent_at           timestamptz,
  opened_at         timestamptz,
  clicked_at        timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists email_sends_campaign_idx on public.email_sends (campaign_id);
create index if not exists email_sends_profile_idx on public.email_sends (profile_id);
create index if not exists email_sends_msg_idx on public.email_sends (brevo_message_id);
create unique index if not exists email_sends_automation_uniq
  on public.email_sends (automation_id, profile_id, ref) where automation_id is not null;

-- 7) RLS: solo admin estricto. Las Edge Functions usan service role. --------
do $$
declare t text;
begin
  foreach t in array array['email_templates','email_campaigns','email_automations','email_sends'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Admin gestiona %1$s" on public.%1$I', t);
    execute format('create policy "Admin gestiona %1$s" on public.%1$I for all
                    using (public.is_strict_admin()) with check (public.is_strict_admin())', t);
  end loop;
end $$;

-- 8) Segmentos: fuente única del recuento y del envío -----------------------
-- segment (todos los filtros se combinan con Y; vacío = todos los clientes):
--   bono_activo: true            → bono activo, no caducado, con clases sin usar
--   class_types: ["grupal",...]  → alguna vez inscrito en esos tipos
--   camp: true                   → tiene alguna reserva de camp no cancelada
--   tienda: true                 → tiene algún pedido no cancelado
--   inactive_months: 6           → sin actividad (clase, camp, pedido, alquiler) en N meses
--   signup_from / signup_to      → fecha de alta (YYYY-MM-DD)
--   ids: ["uuid",...]            → selección manual (ignora el resto de filtros)
-- Siempre: solo role = 'client', con email válido y sin baja.
create or replace function public.email_segment(segment jsonb)
returns table (profile_id uuid)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_types text[];
begin
  if not (public.is_strict_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'no autorizado';
  end if;

  if jsonb_typeof(segment->'class_types') = 'array' then
    select array_agg(x) into v_types from jsonb_array_elements_text(segment->'class_types') x;
  end if;

  return query
  select p.id
  from public.profiles p
  where p.role = 'client'
    and p.email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    and p.email_unsubscribed_at is null
    and (
      jsonb_typeof(segment->'ids') = 'array'
        and p.id in (select (jsonb_array_elements_text(segment->'ids'))::uuid)
      or jsonb_typeof(segment->'ids') is distinct from 'array' and (
        (coalesce((segment->>'bono_activo')::boolean, false) = false or exists (
          select 1 from public.bonos b
          where b.user_id = p.id and b.status = 'active'
            and b.expires_at > now() and b.total_credits > b.used_credits))
        and (v_types is null or cardinality(v_types) = 0 or exists (
          select 1 from public.class_enrollments e
          join public.surf_classes c on c.id = e.class_id
          where e.user_id = p.id and e.status <> 'cancelled' and c.type = any(v_types))
          or v_types is not null and exists (
          select 1 from public.bonos b2 where b2.user_id = p.id and b2.class_type = any(v_types)))
        and (coalesce((segment->>'camp')::boolean, false) = false or exists (
          select 1 from public.bookings bk
          where bk.user_id = p.id and coalesce(bk.status, '') <> 'cancelled'))
        and (coalesce((segment->>'tienda')::boolean, false) = false or exists (
          select 1 from public.orders o
          where o.user_id = p.id and coalesce(o.status, '') <> 'cancelled'))
        and (segment->>'inactive_months' is null or greatest(
              (select max(c.date)::timestamptz from public.class_enrollments e
                 join public.surf_classes c on c.id = e.class_id
                 where e.user_id = p.id and e.status <> 'cancelled'),
              (select max(bk.created_at) from public.bookings bk where bk.user_id = p.id),
              (select max(o.created_at) from public.orders o where o.user_id = p.id),
              (select max(r.date_start)::timestamptz from public.equipment_reservations r where r.user_id = p.id),
              p.created_at
            ) < now() - make_interval(months => (segment->>'inactive_months')::int))
        and (segment->>'signup_from' is null or p.created_at >= (segment->>'signup_from')::date)
        and (segment->>'signup_to' is null or p.created_at < (segment->>'signup_to')::date + 1)
      )
    );
end;
$$;
revoke all on function public.email_segment(jsonb) from public, anon;
grant execute on function public.email_segment(jsonb) to authenticated, service_role;

-- 9) Alta: casilla «No quiero recibir novedades por email» ------------------
-- Igual que el trigger actual de producción + marketing_optout.
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare m jsonb := new.raw_user_meta_data;
begin
  insert into public.profiles (
    id, full_name, last_name, phone, email, birth_date, address, city,
    postal_code, level, wetsuit_size, can_swim, has_injury, injury_detail,
    terms_accepted_at, waiver_accepted_at,
    marketing_optout_at_signup, email_unsubscribed_at
  ) values (
    new.id,
    coalesce(m->>'full_name', ''),
    nullif(m->>'last_name', ''),
    nullif(m->>'phone', ''),
    new.email,
    nullif(m->>'birth_date', '')::date,
    nullif(m->>'address', ''),
    nullif(m->>'city', ''),
    nullif(m->>'postal_code', ''),
    nullif(m->>'level', ''),
    nullif(m->>'wetsuit_size', ''),
    nullif(m->>'can_swim', '')::boolean,
    coalesce(nullif(m->>'has_injury', '')::boolean, false),
    nullif(m->>'injury_detail', ''),
    case when m->>'terms_accepted' = 'true' then now() else null end,
    case when m->>'terms_accepted' = 'true' then now() else null end,
    m->>'marketing_optout' = 'true',
    case when m->>'marketing_optout' = 'true' then now() else null end
  );
  return new;
end;
$function$;

-- 10) Plantillas iniciales (solo si no hay ninguna) -------------------------
insert into public.email_templates (name, subject, preheader, blocks)
select * from (values
  ('Novedad / temporada',
   'Novedades en Entre Olas, {nombre}',
   'Lo que se viene esta temporada',
   '[{"type":"heading","text":"¡Hola, {nombre}!"},
     {"type":"text","text":"Escribe aquí la novedad: nuevas clases, horarios de temporada, un evento en la playa…"},
     {"type":"button","text":"VER CLASES","url":"https://entreolasurf.com/"}]'::jsonb),
  ('Oferta de bono',
   '{nombre}, tu próximo bono con descuento',
   'Solo esta semana',
   '[{"type":"heading","text":"Vuelve al agua, {nombre}"},
     {"type":"text","text":"Esta semana tienes **X% de descuento** en bonos de 5 y 10 clases. Reserva desde tu cuenta y elige tus días."},
     {"type":"button","text":"COMPRAR BONO","url":"https://entreolasurf.com/mi-cuenta/"}]'::jsonb),
  ('Bono a punto de caducar',
   'Tu bono caduca el {caducidad_bono}',
   'Te quedan {clases_restantes} clases',
   '[{"type":"heading","text":"Tu bono caduca pronto"},
     {"type":"text","text":"{nombre}, te quedan **{clases_restantes} clases** de {tipo_bono} sin usar. Tu bono caduca el **{caducidad_bono}**: resérvalas antes para no perderlas."},
     {"type":"button","text":"RESERVAR MIS CLASES","url":"https://entreolasurf.com/mi-cuenta/"}]'::jsonb)
) v(name, subject, preheader, blocks)
where not exists (select 1 from public.email_templates);

notify pgrst, 'reload schema';
