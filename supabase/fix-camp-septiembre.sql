-- Surf Camp de septiembre (10–13 sept 2026) — corrección + oferta por volumen
-- ============================================================
-- Ya NO es "x Sambatrips": es Surf Camp Entre Olas, y son 4 días / 3 noches
-- (10, 11, 12 y 13), no 5. Los textos venían de una edición anterior 9–13.
-- Se cambia también el slug para que la URL no lleve "sambatrips" (la antigua
-- redirige sola, está puesto en vercel.json).
--
-- Precios pedidos por el cliente:  1 → 480€ · 2 → 790€ · 3 → 1125€
-- Como los tramos se guardan POR PERSONA:  480 · 395 (790/2) · 375 (1125/3)
--
-- Solo toca ESTE camp. El de abril (16-19) sí es de Sambatrips y no se toca.
-- Ejecutar en el SQL Editor de Supabase.

update public.surf_camps set
  slug             = 'surf-camp-10-13-septiembre',
  title            = 'Surf Camp Entre Olas 10-13 Septiembre',
  kicker           = 'Roche, Cádiz',
  hero_kicker      = 'Surf Camp Entre Olas',
  hero_title       = '10–13 Septiembre · 4 días para alargar el verano',
  hero_subtitle    = '4 días de surf, aventura y fiesta en villa privada con todo incluido. +18.',
  meta_title       = 'Surf Camp 10–13 Septiembre | Entre Olas',
  meta_description = 'Surf Camp Entre Olas 10-13 Septiembre: 4 días en villa privada con surf, aventura y pensión completa. Desde 480€.',
  description      = '4 días de surf, aventura y fiesta en villa privada con todo incluido.',
  duration_label   = '4 días / 3 noches',
  duration_days    = 4,
  -- OJO: whats_included e ideal_for son text[], no jsonb
  whats_included   = ARRAY[
    'Villa privada de lujo con piscina, jardín, terraza y zonas comunes (a 7 min de la playa)',
    'Pensión completa (desayunos, comidas, cenas y BBQ de bienvenida)',
    'Clases de surf con monitor titulado durante 3 días + material 24h',
    'Transporte ida y vuelta desde aeropuerto de Jerez, Sevilla o San Fernando Bahía Sur',
    'Aventura: parque de tirolinas, rutas por la naturaleza y actividades al aire libre',
    '4 días completos (3 noches en la villa)'
  ]::text[],
  ideal_for        = ARRAY[
    'Mayores de 18 años',
    'Viajeros individuales que buscan grupo',
    'Cualquier nivel de surf',
    'Quienes quieren alargar el verano'
  ]::text[],
  updated_at       = now()
where slug = 'surf-camp-10-13-septiembre-sambatrips';

-- Tramos de precio por volumen (precio POR PERSONA)
-- REQUIERE haber ejecutado antes migration-camp-volume-pricing.sql
insert into public.camp_price_tiers (camp_id, spots, price_per_person)
select c.id, v.spots, v.price
from public.surf_camps c,
     (values (1, 480.00), (2, 395.00), (3, 375.00)) as v(spots, price)
where c.slug = 'surf-camp-10-13-septiembre'
on conflict (camp_id, spots) do update set price_per_person = excluded.price_per_person;

-- Comprobación: debe salir 480 / 790 / 1125
select c.slug, c.title, c.duration_label,
       public.camp_price_for(c.id, 1) as una_plaza,
       public.camp_price_for(c.id, 2) as dos_plazas,
       public.camp_price_for(c.id, 3) as tres_plazas
from public.surf_camps c
where c.slug = 'surf-camp-10-13-septiembre';
