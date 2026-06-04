-- Migration: total editable del bono (jun-2026, P6)
-- ============================================================
-- Permite fijar a mano el precio total de un bono (descuento / precio a medida).
-- Si custom_total es NULL, se usa el precio del catálogo por nº de créditos.
-- La ficha de reserva, las estadísticas, el filtro de clientes y el color del
-- calendario respetan este total. Ejecutar en el SQL Editor de Supabase.

alter table public.bonos add column if not exists custom_total numeric;
comment on column public.bonos.custom_total is
  'Precio total del bono fijado a mano (descuento/precio a medida). Si NULL, se usa el precio del catálogo por nº de créditos.';
