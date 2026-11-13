-- ============================================================
-- Referidos (vendedores) de Surf Camp — fase 1
-- ------------------------------------------------------------
-- Cada vendedor tiene un código (?ref=codigo en cualquier URL de la web).
-- La venta online se atribuye en create-checkout/stripe-webhook; las ventas
-- por WhatsApp se asignan a mano desde Reservas ("Vendido por").
-- Comisión y descuento son OPCIONALES por vendedor ('none' = sin).
--   commission: 'percent' (% del total del camp) | 'per_spot' (€ por plaza)
--   discount:   'percent' (% del total del camp) | 'per_spot' (€ por plaza)
-- El descuento rebaja el TOTAL de la reserva, nunca la señal.
-- Solo el admin (is_strict_admin) gestiona vendedores; el staff con acceso
-- a reservas/camps puede leerlos para asignarlos.
-- ============================================================

create table if not exists public.referrers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique check (code ~ '^[a-z0-9-]{2,40}$'),
  active boolean not null default true,
  commission_type text not null default 'none' check (commission_type in ('none','percent','per_spot')),
  commission_value numeric not null default 0 check (commission_value >= 0),
  discount_type text not null default 'none' check (discount_type in ('none','percent','per_spot')),
  discount_value numeric not null default 0 check (discount_value >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.referrers enable row level security;

drop policy if exists "Staff read referrers" on public.referrers;
create policy "Staff read referrers" on public.referrers
  for select using (public.enc_can(array['reservas','camps']));

drop policy if exists "Admin manage referrers" on public.referrers;
create policy "Admin manage referrers" on public.referrers
  for all using (public.is_strict_admin()) with check (public.is_strict_admin());

alter table public.bookings
  add column if not exists referrer_id uuid references public.referrers(id) on delete set null;
create index if not exists bookings_referrer_id_idx on public.bookings(referrer_id);

-- Un cliente puede insertar su propia reserva (políticas "Users create own
-- bookings" / "Allow guest booking insert"): sin esto podría atribuírsela a un
-- vendedor. Solo el webhook (service_role) y el staff tocan referrer_id.
create or replace function public.bookings_referrer_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.referrer_id is distinct from (case when tg_op = 'UPDATE' then old.referrer_id else null end)
     and coalesce(auth.role(), '') in ('anon', 'authenticated')   -- peticiones de la web; service_role y SQL editor pasan
     and not public.enc_can(array['reservas','camps']) then
    raise exception 'No autorizado a asignar vendedor';
  end if;
  return new;
end $$;

drop trigger if exists bookings_referrer_guard on public.bookings;
create trigger bookings_referrer_guard
  before insert or update of referrer_id on public.bookings
  for each row execute function public.bookings_referrer_guard();

-- Lectura pública mínima para la web: solo nombre y descuento de un código
-- activo (nunca la comisión).
create or replace function public.referral_info(p_code text)
returns table (name text, discount_type text, discount_value numeric)
language sql stable security definer set search_path = public as $$
  select r.name, r.discount_type, r.discount_value
  from public.referrers r
  where r.code = lower(trim(p_code)) and r.active
$$;
grant execute on function public.referral_info(text) to anon, authenticated;
