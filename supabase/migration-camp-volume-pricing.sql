-- Migration: Surf Camps — precio por volumen (descuento por nº de plazas)
-- ============================================================
-- Cada camp puede definir tramos: 1 plaza al precio base, 2 plazas a X cada
-- una, 3 a Y cada una… El precio del tramo es POR PERSONA. Las plazas que
-- pasen del último tramo se cobran a surf_camps.extra_spot_price (si no está
-- puesto, al precio del último tramo).
--
-- Multi-plaza obliga a tocar el aforo: hasta ahora 1 reserva = 1 plaza. Ahora
-- bookings.num_spots dice cuántas ocupa, y el trigger suma/resta esa cantidad.
-- Ejecutar en el SQL Editor de Supabase.

-- 1. Tramos de precio por camp
create table if not exists public.camp_price_tiers (
  id               uuid primary key default gen_random_uuid(),
  camp_id          uuid not null references public.surf_camps(id) on delete cascade,
  spots            int not null check (spots >= 1),
  price_per_person numeric(10,2) not null check (price_per_person >= 0),
  created_at       timestamptz not null default now(),
  unique (camp_id, spots)
);
alter table public.camp_price_tiers enable row level security;

drop policy if exists "Public read camp tiers" on public.camp_price_tiers;
create policy "Public read camp tiers" on public.camp_price_tiers for select using (true);

drop policy if exists "Staff manage camp tiers" on public.camp_price_tiers;
create policy "Staff manage camp tiers" on public.camp_price_tiers for all
  using (public.enc_can(array['camps','reservas'])) with check (public.enc_can(array['camps','reservas']));

create index if not exists idx_camp_tiers_camp on public.camp_price_tiers(camp_id, spots);

-- 2. Precio de cada plaza por encima del último tramo
alter table public.surf_camps add column if not exists extra_spot_price numeric(10,2);

-- 3. Plazas que ocupa cada reserva
alter table public.bookings add column if not exists num_spots int not null default 1;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_num_spots_positive') then
    alter table public.bookings add constraint bookings_num_spots_positive check (num_spots >= 1);
  end if;
end $$;

-- 4. El aforo pasa a contar plazas, no reservas
create or replace function public.update_spots_on_booking()
returns trigger as $$
declare
  v_old_occ boolean := (TG_OP <> 'INSERT') and (OLD.status in ('deposit_paid','fully_paid'));
  v_new_occ boolean := (TG_OP <> 'DELETE') and (NEW.status in ('deposit_paid','fully_paid'));
  v_camp uuid := case when TG_OP = 'DELETE' then OLD.camp_id else NEW.camp_id end;
  v_old_n int := case when TG_OP = 'INSERT' then 0 else coalesce(OLD.num_spots, 1) end;
  v_new_n int := case when TG_OP = 'DELETE' then 0 else coalesce(NEW.num_spots, 1) end;
  v_delta int := (case when v_new_occ then v_new_n else 0 end)
               - (case when v_old_occ then v_old_n else 0 end);
begin
  if v_camp is null or v_delta = 0 then
    return case when TG_OP = 'DELETE' then OLD else NEW end;
  end if;

  update public.surf_camps
  set spots_taken = greatest(spots_taken + v_delta, 0),
      status = case
        when status = 'closed' then 'closed'
        when greatest(spots_taken + v_delta, 0) >= max_spots then 'full'
        when status = 'full' and greatest(spots_taken + v_delta, 0) < max_spots then 'open'
        else status
      end
  where id = v_camp;

  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$ language plpgsql security definer;

drop trigger if exists on_booking_status_change on public.bookings;
create trigger on_booking_status_change
  after insert or update or delete on public.bookings
  for each row execute function public.update_spots_on_booking();

-- 5. Precio de N plazas según los tramos del camp. Fuente única de verdad:
--    la usa el frontend para mostrar y el checkout para cobrar.
create or replace function public.camp_price_for(p_camp_id uuid, p_spots int)
returns numeric
language plpgsql
stable
as $$
declare
  v_base   numeric;
  v_extra  numeric;
  v_tier   record;
  v_maxq   int;
begin
  if p_spots is null or p_spots < 1 then return 0; end if;

  select price, extra_spot_price into v_base, v_extra
  from public.surf_camps where id = p_camp_id;
  if v_base is null then return 0; end if;

  -- Tramo aplicable: el de mayor 'spots' que no supere lo pedido
  select * into v_tier from public.camp_price_tiers
  where camp_id = p_camp_id and spots <= p_spots
  order by spots desc limit 1;

  select max(spots) into v_maxq from public.camp_price_tiers where camp_id = p_camp_id;

  if v_tier is null then
    -- Sin tramo aplicable: todo a precio base
    return round(v_base * p_spots, 2);
  end if;

  if p_spots <= v_maxq then
    return round(v_tier.price_per_person * p_spots, 2);
  end if;

  -- Por encima del último tramo: el tramo cubre v_maxq plazas y el resto va
  -- al precio de plaza extra (o al del tramo si no se ha configurado).
  return round(
    v_tier.price_per_person * v_maxq
    + coalesce(v_extra, v_tier.price_per_person) * (p_spots - v_maxq), 2);
end;
$$;

select pg_notify('pgrst', 'reload schema');
