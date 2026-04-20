-- Migration: Añade columna card_vibe a surf_camps
-- Para el texto que aparece tras el ⚡ en las cards (ej: "SURF, SOCIAL")

ALTER TABLE public.surf_camps
  ADD COLUMN IF NOT EXISTS card_vibe TEXT;

-- Valores por defecto para los camps existentes
UPDATE public.surf_camps SET card_vibe = 'SOCIAL, ACTIVE'
  WHERE slug = 'surf-camp-10abril-13abril' AND card_vibe IS NULL;

UPDATE public.surf_camps SET card_vibe = 'SOCIAL, ACTIVE'
  WHERE slug = 'surf-camp-16-19-abril-sambatrips' AND card_vibe IS NULL;

UPDATE public.surf_camps SET card_vibe = 'SURF, SOCIAL'
  WHERE slug = 'surf-camp-9-13-septiembre-sambatrips' AND card_vibe IS NULL;
