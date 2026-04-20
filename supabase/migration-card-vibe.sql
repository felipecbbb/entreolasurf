-- Migration: Añade columna card_vibe y duration_label a surf_camps
-- card_vibe: texto tras el ⚡ en las cards (ej: "SURF, SOCIAL")
-- duration_label: texto de duración de la card (ej: "4 días / 3 noches")
--                 Si NULL, se calcula automáticamente desde las fechas.

ALTER TABLE public.surf_camps
  ADD COLUMN IF NOT EXISTS card_vibe TEXT,
  ADD COLUMN IF NOT EXISTS duration_label TEXT;

-- Valores por defecto para los camps existentes
UPDATE public.surf_camps SET card_vibe = 'SOCIAL, ACTIVE'
  WHERE slug = 'surf-camp-10abril-13abril' AND card_vibe IS NULL;

UPDATE public.surf_camps SET card_vibe = 'SOCIAL, ACTIVE'
  WHERE slug = 'surf-camp-16-19-abril-sambatrips' AND card_vibe IS NULL;

UPDATE public.surf_camps SET card_vibe = 'SURF, SOCIAL'
  WHERE slug = 'surf-camp-9-13-septiembre-sambatrips' AND card_vibe IS NULL;
