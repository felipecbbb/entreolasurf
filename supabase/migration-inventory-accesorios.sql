-- Migration: categoría "accesorio" en el inventario (jun-2026)
-- ============================================================
-- Sección interna "Accesorios tablas": las tablas etiquetadas "Invento"
-- (Gara/Tribord de reserva) y las "Quillas" (aletas) NO se alquilan online;
-- se gestionan solo en el panel. Ejecutar en el SQL Editor de Supabase.

alter table public.inventory_units drop constraint if exists inventory_units_category_check;
alter table public.inventory_units add constraint inventory_units_category_check
  check (category in ('neopreno','licra','tabla','accesorio'));

-- Mover "Invento" y "Quillas" a accesorios y desvincularlas del catálogo web
update public.inventory_units
set category = 'accesorio', equipment_id = null, updated_at = now()
where category = 'tabla' and number in ('Invento','Quillas');
