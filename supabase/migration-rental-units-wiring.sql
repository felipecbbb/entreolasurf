-- Migration: alquiler web basado en inventario por unidad (jun-2026, fase 2)
-- ============================================================
-- Conecta el catálogo (rental_equipment) con las unidades físicas
-- (inventory_units): la disponibilidad sale del conteo de unidades
-- 'disponible' por (equipo, talla), y el admin asigna la unidad concreta
-- en la ficha de la reserva. Ejecutar en el SQL Editor de Supabase.

-- 1) Ítem de catálogo "Licra" (las licras se alquilan online por talla).
--    Precios de partida; el admin los ajusta en el panel.
insert into public.rental_equipment (name, slug, type, description, pricing, deposit, stock, sizes, tags, active)
select 'Licra', 'licra', 'con_talla', 'Licra de neopreno / lycra para surf.',
       '{"1h":3,"2h":5,"4h":7,"1d":10,"1w":35}'::jsonb, 5, 0, '[]'::jsonb, array['licra','surf'], true
where not exists (select 1 from public.rental_equipment where slug='licra');

-- 2) Enlace unidad ↔ catálogo (DATOS, no esquema; según el inventario importado):
--    - licras  → ítem "Licra"
--    - tablas  → Paddle Surf / Tabla Dura / Tabla Soft Board (heurística por marca/descripción)
--    - neoprenos ya venían enlazados a "Neopreno"
--    - "Quillas" (accesorio) quedan sin catálogo
update public.inventory_units set equipment_id=(select id from public.rental_equipment where slug='licra')
  where category='licra';
update public.inventory_units set equipment_id=(select id from public.rental_equipment where slug='paddle-surf')
  where category='tabla' and (upper(coalesce(descripcion,'')) like '%PADDLE%' or upper(coalesce(marca,'')) like '%FANATIC%');
update public.inventory_units set equipment_id=(select id from public.rental_equipment where slug='tabla-dura')
  where category='tabla' and equipment_id is null and upper(coalesce(marca,'')) in ('FIBRA','NSP','UP BLADE');
update public.inventory_units set equipment_id=(select id from public.rental_equipment where slug='tabla-soft-board')
  where category='tabla' and equipment_id is null and number <> 'Quillas';

-- 3) Unidad física asignada por el admin a una reserva
alter table public.equipment_reservations
  add column if not exists assigned_unit_id uuid references public.inventory_units(id) on delete set null;

create index if not exists idx_inventory_units_equipment on public.inventory_units(equipment_id);

-- 4) RPC pública de stock por (equipo, talla) según unidades 'disponible'.
--    Para tablas, la talla es el largo en pies formateado (7.0 → 7'0).
--    Devuelve solo conteos (sin PII) → segura para anon.
create or replace function public.get_rental_stock()
returns table(equipment_id uuid, size text, available int)
language sql stable security definer set search_path to 'public' as $$
  select equipment_id,
         case when category='tabla' and pies is not null
              then trunc(pies)::int::text || '''' || round((pies - trunc(pies))*10)::int::text
              else talla end as size,
         count(*)::int as available
  from public.inventory_units
  where equipment_id is not null and estado = 'disponible'
  group by 1, 2;
$$;
grant execute on function public.get_rental_stock() to anon, authenticated;

-- 5) Auto-asignación de unidad física al reservar por web.
--    Elige al azar una unidad 'disponible' de la talla pedida, sin solape de
--    fechas con otra reserva activa. Devuelve la unidad asignada (o null).
--    El admin puede reasignarla luego desde el calendario.
create or replace function public.assign_rental_unit(p_reservation_id uuid)
returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare
  v_eq uuid; v_size text; v_ds date; v_de date; v_assigned uuid; v_unit uuid;
begin
  select equipment_id, size, date_start, date_end, assigned_unit_id
    into v_eq, v_size, v_ds, v_de, v_assigned
  from public.equipment_reservations where id = p_reservation_id;
  if not found or v_eq is null then return null; end if;
  if v_assigned is not null then return v_assigned; end if;

  select u.id into v_unit
  from public.inventory_units u
  where u.equipment_id = v_eq
    and u.estado = 'disponible'
    and ( v_size is null
          or coalesce(
               case when u.category = 'tabla' and u.pies is not null
                    then trunc(u.pies)::int::text || '''' || round((u.pies - trunc(u.pies))*10)::int::text
                    else u.talla end, '') = coalesce(v_size, '') )
    and not exists (
      select 1 from public.equipment_reservations r2
      where r2.assigned_unit_id = u.id
        and r2.id <> p_reservation_id
        and r2.status in ('pending','confirmed','active')
        and r2.date_start <= v_de and r2.date_end >= v_ds )
  order by random()
  limit 1
  for update of u skip locked;

  if v_unit is null then return null; end if;
  update public.equipment_reservations
    set assigned_unit_id = v_unit, updated_at = now()
    where id = p_reservation_id;
  return v_unit;
end;
$$;
revoke execute on function public.assign_rental_unit(uuid) from anon, public;
grant execute on function public.assign_rental_unit(uuid) to authenticated, service_role;
