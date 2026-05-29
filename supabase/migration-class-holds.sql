-- ============================================================
-- Migration: Holds de plazas (reserva temporal 10 min) para el
--            flujo de reserva de clases desde la página de packs.
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. TABLA class_holds — plazas apartadas temporalmente
--    Una fila = una plaza reservada. Sin login: se identifica por cart_token.
-- ============================================================
create table if not exists public.class_holds (
  id          uuid primary key default uuid_generate_v4(),
  class_id    uuid not null references public.surf_classes(id) on delete cascade,
  cart_token  text not null,
  held_until  timestamptz not null,
  created_at  timestamptz not null default now()
);

comment on table public.class_holds is 'Plazas apartadas temporalmente durante la preselección de clases (caducan a los 10 min). Una fila por plaza.';

create index if not exists idx_class_holds_class on public.class_holds(class_id);
create index if not exists idx_class_holds_token on public.class_holds(cart_token);
create index if not exists idx_class_holds_until on public.class_holds(held_until);

-- RLS: sin políticas → solo accesible vía las funciones SECURITY DEFINER de abajo
alter table public.class_holds enable row level security;

-- 2. fetch_class_availability — clases publicadas + plazas reales
--    (confirmadas + holds activos). La usan el picker y el calendario.
-- ============================================================
create or replace function public.fetch_class_availability(
  p_date  date,
  p_type  text default null,
  p_level text default null
)
returns setof jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(c) || jsonb_build_object(
    'holds_count', coalesce(h.cnt, 0),
    'confirmed_count', c.enrolled_count,
    'spots_taken', c.enrolled_count + coalesce(h.cnt, 0),
    'spots_left', greatest(c.max_students - c.enrolled_count - coalesce(h.cnt, 0), 0)
  )
  from public.surf_classes c
  left join lateral (
    select count(*) as cnt
    from public.class_holds ch
    where ch.class_id = c.id and ch.held_until > now()
  ) h on true
  where c.date = p_date
    and c.published = true
    and c.status = 'scheduled'
    and (p_type is null or c.type = p_type)
    and (p_level is null or p_level = 'todos' or c.level = p_level or c.level = 'todos')
  order by c.time_start;
$$;

-- 3. create_hold — aparta p_qty plazas de una clase para un cart_token.
--    Valida disponibilidad con lock, y reextiende a 10 min TODOS los holds
--    del token (contador unificado). Devuelve held_until.
-- ============================================================
create or replace function public.create_hold(
  p_class_id   uuid,
  p_cart_token text,
  p_qty        int default 1
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class   public.surf_classes%rowtype;
  v_active  int;
  v_left    int;
  v_until   timestamptz := now() + interval '10 minutes';
begin
  if p_cart_token is null or length(p_cart_token) < 8 then
    raise exception 'Token de carrito inválido';
  end if;
  if p_qty < 1 then
    raise exception 'Cantidad inválida';
  end if;

  -- Lock de la clase para evitar carreras
  select * into v_class from public.surf_classes where id = p_class_id for update;
  if not found then
    raise exception 'Clase no encontrada';
  end if;
  if v_class.published is not true or v_class.status <> 'scheduled' then
    raise exception 'Clase no disponible';
  end if;

  -- Plazas ocupadas = inscripciones confirmadas + holds activos (cualquier token)
  select count(*) into v_active
  from public.class_holds
  where class_id = p_class_id and held_until > now();

  v_left := v_class.max_students - v_class.enrolled_count - v_active;
  if v_left < p_qty then
    raise exception 'No quedan plazas suficientes (disponibles: %)', greatest(v_left, 0);
  end if;

  -- Inserta las plazas
  insert into public.class_holds (class_id, cart_token, held_until)
  select p_class_id, p_cart_token, v_until
  from generate_series(1, p_qty);

  -- Reextiende todos los holds del token al mismo deadline (contador único)
  update public.class_holds
  set held_until = v_until
  where cart_token = p_cart_token and held_until > now();

  return v_until;
end;
$$;

-- 4. release_class_holds — libera las plazas de UNA clase para un token
--    (cuando el usuario deselecciona una clase concreta).
-- ============================================================
create or replace function public.release_class_holds(
  p_class_id   uuid,
  p_cart_token text,
  p_qty        int default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_qty is null then
    delete from public.class_holds
    where cart_token = p_cart_token and class_id = p_class_id;
  else
    delete from public.class_holds
    where id in (
      select id from public.class_holds
      where cart_token = p_cart_token and class_id = p_class_id
      limit p_qty
    );
  end if;
end;
$$;

-- 5. release_holds — libera TODAS las plazas de un token
--    (caducidad del contador, vaciar carrito, o tras convertir en webhook).
-- ============================================================
create or replace function public.release_holds(p_cart_token text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.class_holds where cart_token = p_cart_token;
$$;

-- 6. Permisos: anon y authenticated pueden usar las funciones
-- ============================================================
grant execute on function public.fetch_class_availability(date, text, text) to anon, authenticated;
grant execute on function public.create_hold(uuid, text, int)            to anon, authenticated;
grant execute on function public.release_class_holds(uuid, text, int)     to anon, authenticated;
grant execute on function public.release_holds(text)                      to anon, authenticated;

-- 7. (OPCIONAL) Limpieza periódica de holds caducados con pg_cron.
--    La disponibilidad ya ignora los caducados (held_until > now()), así que
--    esto es solo higiene. Si pg_cron no está habilitado, omite este bloque.
-- ============================================================
-- create extension if not exists pg_cron;
-- select cron.schedule(
--   'cleanup-class-holds',
--   '*/5 * * * *',
--   $$ delete from public.class_holds where held_until < now() - interval '5 minutes' $$
-- );
