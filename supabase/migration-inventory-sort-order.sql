-- Migration: orden manual del inventario (jun-2026)
-- ============================================================
-- Permite arrastrar filas para reordenarlas y crear unidades en una posición
-- concreta (no solo al final/principio). El orden de pantalla pasa a depender de
-- sort_order, independiente del 'number' (que sigue siendo el identificador físico).
-- Ejecutar en el SQL Editor de Supabase.

alter table public.inventory_units add column if not exists sort_order double precision;

-- Backfill: por categoría, respetando el orden natural por número actual
-- (los numéricos por valor primero, luego el resto alfabético). Espaciado *100
-- para poder insertar entre dos filas sin renumerar.
with ordered as (
  select id,
    row_number() over (
      partition by category
      order by
        (number ~ '^[0-9]+(\.[0-9]+)?$') desc,
        case when number ~ '^[0-9]+(\.[0-9]+)?$' then number::numeric end nulls last,
        number
    ) * 100.0 as so
  from public.inventory_units
)
update public.inventory_units u
set sort_order = o.so
from ordered o
where o.id = u.id and u.sort_order is null;
