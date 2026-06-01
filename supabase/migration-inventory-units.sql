-- Migration: inventario por unidad (jun-2026)
-- ============================================================
-- El material de alquiler es stock único numerado (Excel del cliente):
-- cada neopreno/licra/tabla es una unidad física con su número y estado.
-- Esta tabla guarda esas unidades; el catálogo (rental_equipment) sigue
-- definiendo tipos y precios. Fase 2 enlazará disponibilidad ↔ unidades.
-- Ejecutar en el SQL Editor de Supabase.

CREATE TABLE IF NOT EXISTS public.inventory_units (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category     text NOT NULL CHECK (category IN ('neopreno','licra','tabla')),
  number       text,
  equipment_id uuid REFERENCES public.rental_equipment(id) ON DELETE SET NULL,
  tipo         text,        -- neopreno: Corto/Largo
  grosor       text,        -- neopreno: 2.2mm, 3.2mm…
  talla        text,        -- neopreno/licra: M, 10, 150…
  genero       text,        -- licra: Niño/Hombre/Mujer
  marca        text,
  pies         numeric,     -- tabla: largo en pies
  descripcion  text,
  estado       text NOT NULL DEFAULT 'disponible'
                 CHECK (estado IN ('disponible','en_uso','reparacion','perdido','baja')),
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_units_category ON public.inventory_units(category);
CREATE INDEX IF NOT EXISTS idx_inventory_units_estado   ON public.inventory_units(estado);

-- RLS: solo staff con acceso a la sección "material" (admin o encargado autorizado)
ALTER TABLE public.inventory_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage inventory units" ON public.inventory_units;
CREATE POLICY "Staff manage inventory units" ON public.inventory_units
  FOR ALL USING (enc_can(ARRAY['material'])) WITH CHECK (enc_can(ARRAY['material']));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_units TO authenticated;
GRANT ALL ON public.inventory_units TO service_role;
-- (anon queda bloqueado por la política aunque herede grants por defecto del esquema)
