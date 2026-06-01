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
