-- Migration: Añade columna hero_tags a surf_camps
-- Las píldoras que aparecen bajo el subtítulo del hero en la página de detalle

ALTER TABLE public.surf_camps
  ADD COLUMN IF NOT EXISTS hero_tags TEXT[];

-- Valores actuales extraídos del HTML de cada camp
UPDATE public.surf_camps SET hero_tags = ARRAY[
  '10–13 Abril',
  'Roche, Cádiz',
  'Plazas limitadas',
  'Transporte incluido',
  '+18'
] WHERE slug = 'surf-camp-10abril-13abril' AND hero_tags IS NULL;

UPDATE public.surf_camps SET hero_tags = ARRAY[
  '16–19 Abril',
  'Roche, Cádiz',
  'Plazas limitadas',
  'Transporte incluido',
  '+18'
] WHERE slug = 'surf-camp-16-19-abril-sambatrips' AND hero_tags IS NULL;

UPDATE public.surf_camps SET hero_tags = ARRAY[
  '9–13 Septiembre',
  'Roche, Cádiz',
  'Plazas limitadas',
  'Transporte incluido',
  '+18'
] WHERE slug = 'surf-camp-9-13-septiembre-sambatrips' AND hero_tags IS NULL;
