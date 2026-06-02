-- Migration: categorías de inventario no-tabla (jun-2026)
-- ============================================================
-- Separa del catálogo de tablas las unidades que no son tablas de alquiler:
--   · accesorio  → "Invento" (Gara/Tribord de reserva) + "Quillas". Interno, no web.
--   · gorros     → gorros de instructor (KOTINOUSSA). Interno, no web.
--   · bodyboard  → bodyboards (GENESIS), enlazados al ítem de catálogo "Body Board".
-- Además: UP BLADE pasa de "Tabla Dura" a "Tabla Soft Board".
-- Ejecutar en el SQL Editor de Supabase.

alter table public.inventory_units drop constraint if exists inventory_units_category_check;
alter table public.inventory_units add constraint inventory_units_category_check
  check (category in ('neopreno','licra','tabla','accesorio','gorros','bodyboard'));

-- Accesorios internos: "Invento" (Gara/Tribord) + "Quillas"
update public.inventory_units
set category = 'accesorio', equipment_id = null, updated_at = now()
where category = 'tabla' and number in ('Invento','Quillas');

-- Gorros de instructor (KOTINOUSSA): interno, sin catálogo web
update public.inventory_units set category='gorros', equipment_id=null, updated_at=now()
where category='tabla' and upper(coalesce(marca,'')) = 'KOTINOUSSA';

-- Bodyboards (GENESIS): enlazados al ítem de catálogo "Body Board"
update public.inventory_units set category='bodyboard',
  equipment_id = (select id from public.rental_equipment where slug='body-board'), updated_at=now()
where category='tabla' and upper(coalesce(marca,'')) = 'GENESIS';

-- UP BLADE: de Tabla Dura a Tabla Soft Board
update public.inventory_units
set equipment_id = (select id from public.rental_equipment where slug='tabla-soft-board'), updated_at=now()
where category='tabla' and upper(coalesce(marca,'')) = 'UP BLADE';
