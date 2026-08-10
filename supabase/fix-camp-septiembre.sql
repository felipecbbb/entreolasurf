-- Corrección del Surf Camp de septiembre (10–13 sept 2026)
-- ============================================================
-- Ya NO es "x Sambatrips": es Surf Camp Entre Olas. Y son 4 días / 3 noches
-- (10, 11, 12 y 13), no 5 — los textos habían quedado de una edición anterior
-- que iba del 9 al 13. Las fechas de la tabla (date_start/date_end) y
-- duration_days/duration_label ya eran correctas; lo que estaba mal eran los
-- textos escritos a mano.
--
-- Solo toca ESTE camp. El de abril (16-19) sí es de Sambatrips y no se toca.
-- Ejecutar en el SQL Editor de Supabase.

update public.surf_camps set
  title            = 'Surf Camp Entre Olas 10-13 Septiembre',
  kicker           = 'Surf Camp Entre Olas',
  hero_kicker      = 'Surf Camp Entre Olas',
  hero_title       = '10–13 Septiembre · 4 días para alargar el verano',
  hero_subtitle    = '4 días de surf, aventura y fiesta en villa privada con todo incluido. +18.',
  meta_title       = 'Surf Camp 10–13 Septiembre | Entre Olas',
  meta_description = 'Surf Camp Entre Olas 10-13 Septiembre: 4 días en villa privada con surf, aventura y pensión completa.',
  description      = '4 días de surf, aventura y fiesta en villa privada con todo incluido.',
  whats_included   = jsonb_build_array(
    'Villa privada de lujo con piscina, jardín, terraza y zonas comunes (a 7 min de la playa)',
    'Pensión completa (desayunos, comidas, cenas y BBQ de bienvenida)',
    'Clases de surf con monitor titulado durante 3 días + material 24h',
    'Transporte ida y vuelta desde aeropuerto de Jerez, Sevilla o San Fernando Bahía Sur',
    'Aventura: parque de tirolinas, rutas por la naturaleza y actividades al aire libre',
    '4 días completos (3 noches en la villa)'
  ),
  ideal_for        = jsonb_build_array(
    'Mayores de 18 años',
    'Viajeros individuales que buscan grupo',
    'Cualquier nivel de surf',
    'Quienes quieren alargar el verano'
  ),
  updated_at       = now()
where slug = 'surf-camp-10-13-septiembre-sambatrips';

-- Comprobación
select slug, title, hero_title, duration_label, date_start, date_end
from public.surf_camps
where slug = 'surf-camp-10-13-septiembre-sambatrips';
