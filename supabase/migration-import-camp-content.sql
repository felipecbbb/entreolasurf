-- Migration: Importar contenido HTML existente a surf_camps + camp_faqs
-- Rellena hero, descripción, qué incluye, FAQs para los 3 camps activos
-- Se puede re-ejecutar sin duplicar FAQs (hace DELETE + INSERT por camp_id)

-- ============================================================
-- 1. SURF CAMP XXL · 10-13 Abril
-- ============================================================
UPDATE public.surf_camps SET
  kicker               = 'Surf Camp XXL',
  hero_kicker          = 'Surf Camp XXL',
  hero_title           = '10–13 Abril · Dos villas, doble diversión',
  hero_subtitle        = 'El plan definitivo: dos villas unidas a 2 min de la playa, transporte incluido, hasta 15 influencers invitados y el mejor ambiente. +18.',
  hero_image           = COALESCE(NULLIF(hero_image, ''), '/uploads/2026/02/DJI_0128-Editar.webp'),
  description          = 'Surf Camp XXL: dos villas unidas a 2 min de la playa, transporte incluido, clases de surf, hasta 15 influencers invitados y el mejor ambiente. Todo incluido.',
  color                = COALESCE(color, '#0f2f39'),
  price                = 480,
  original_price       = 600,
  deposit              = 180,
  max_spots            = 17,
  whats_included_title = '¿Qué incluye el Surf Camp XXL?',
  whats_included       = ARRAY[
    'Alojamiento en dos villas privadas unidas con piscina, jardín y zonas comunes (2 min de la playa)',
    'Pensión completa (desayunos, comidas, cenas y BBQ de bienvenida)',
    '3 clases de surf con monitor titulado + material disponible 24h',
    'Transporte ida y vuelta desde aeropuerto de Jerez, Sevilla o San Fernando Bahía Sur',
    'Aventura: parque de tirolinas, rutas por la naturaleza y actividades al aire libre',
    'Habitaciones en dos villas (distribución en check-in según disponibilidad)'
  ],
  ideal_for_title      = 'Ideal para',
  ideal_for            = ARRAY[
    'Mayores de 18 años',
    'Personas que viajan solas y quieren integrarse en el grupo',
    'Grupos de amigos buscando una experiencia intensa',
    'Cualquier nivel de surf: desde iniciación hasta avanzado'
  ],
  meta_title           = 'Surf Camp XXL 10–13 Abril | Entre Olas',
  meta_description     = 'Surf Camp XXL 10-13 Abril: dos villas unidas, transporte incluido, clases de surf, influencers invitados. Desde 480€.',
  updated_at           = now()
WHERE slug = 'surf-camp-10abril-13abril';

-- ============================================================
-- 2. SURF CAMP x SAMBATRIPS · 16-19 Abril
-- ============================================================
UPDATE public.surf_camps SET
  kicker               = 'Surf Camp x Sambatrips',
  hero_kicker          = 'Surf Camp x Sambatrips',
  hero_title           = '16–19 Abril · Villa privada, surf y aventura',
  hero_subtitle        = 'Edición especial de 4 días con todo incluido: transporte, pensión completa, clases de surf, material y seguro. +18.',
  hero_image           = COALESCE(NULLIF(hero_image, ''), '/uploads/2025/12/14.png'),
  description          = 'Edición especial Surf Camp x Sambatrips de 4 días en villa privada con todo incluido: transporte, pensión completa, clases de surf, material y seguro.',
  color                = COALESCE(color, '#0f2f39'),
  price                = 580,
  deposit              = 180,
  max_spots            = 17,
  whats_included_title = '¿Qué incluye el Surf Camp?',
  whats_included       = ARRAY[
    'Villa privada de lujo con piscina, jardín, terraza y zonas comunes (a 7 min de la playa)',
    'Pensión completa (desayunos, comidas, cenas y BBQ de bienvenida)',
    '3 clases de surf con monitor titulado + material disponible 24h',
    'Transporte ida y vuelta desde aeropuerto de Jerez, Sevilla o San Fernando Bahía Sur',
    'Aventura: parque de tirolinas, rutas por la naturaleza y actividades al aire libre',
    'Seguro de viaje incluido'
  ],
  ideal_for_title      = 'Ideal para',
  ideal_for            = ARRAY[
    'Mayores de 18 años',
    'Viajeros individuales que buscan grupo',
    'Cualquier nivel de surf'
  ],
  meta_title           = 'Surf Camp 16–19 Abril x Sambatrips | Entre Olas',
  meta_description     = 'Surf Camp x Sambatrips 16-19 Abril: villa privada, pensión completa, seguro incluido y transporte. 580€.',
  updated_at           = now()
WHERE slug = 'surf-camp-16-19-abril-sambatrips';

-- ============================================================
-- 3. SURF CAMP x SAMBATRIPS · 9-13 Septiembre
-- ============================================================
UPDATE public.surf_camps SET
  kicker               = 'Surf Camp x Sambatrips',
  hero_kicker          = 'Surf Camp x Sambatrips',
  hero_title           = '9–13 Septiembre · 5 días para alargar el verano',
  hero_subtitle        = 'La edición más larga: 5 días de surf, aventura y fiesta en villa privada con todo incluido. +18.',
  hero_image           = COALESCE(NULLIF(hero_image, ''), '/uploads/2025/12/13.png'),
  description          = 'La edición más larga del Surf Camp: 5 días de surf, aventura y fiesta en villa privada con todo incluido.',
  color                = COALESCE(color, '#0f2f39'),
  price                = 580,
  deposit              = 180,
  max_spots            = 17,
  whats_included_title = '¿Qué incluye el Surf Camp?',
  whats_included       = ARRAY[
    'Villa privada de lujo con piscina, jardín, terraza y zonas comunes (a 7 min de la playa)',
    'Pensión completa (desayunos, comidas, cenas y BBQ de bienvenida)',
    'Clases de surf con monitor titulado durante 5 días + material 24h',
    'Transporte ida y vuelta desde aeropuerto de Jerez, Sevilla o San Fernando Bahía Sur',
    'Aventura: parque de tirolinas, rutas por la naturaleza y actividades al aire libre',
    '5 días completos (un día extra respecto a las ediciones estándar)'
  ],
  ideal_for_title      = 'Ideal para',
  ideal_for            = ARRAY[
    'Mayores de 18 años',
    'Viajeros individuales que buscan grupo',
    'Cualquier nivel de surf',
    'Quienes quieren alargar el verano con una edición de 5 días'
  ],
  meta_title           = 'Surf Camp 9–13 Septiembre x Sambatrips | Entre Olas',
  meta_description     = 'Surf Camp x Sambatrips 9-13 Septiembre: 5 días en villa privada con surf, aventura y pensión completa. 580€.',
  updated_at           = now()
WHERE slug = 'surf-camp-9-13-septiembre-sambatrips';

-- ============================================================
-- 4. FAQs — borramos e insertamos para los 3 camps (idempotente)
-- ============================================================
DELETE FROM public.camp_faqs
WHERE camp_id IN (
  SELECT id FROM public.surf_camps
  WHERE slug IN (
    'surf-camp-10abril-13abril',
    'surf-camp-16-19-abril-sambatrips',
    'surf-camp-9-13-septiembre-sambatrips'
  )
);

-- FAQs comunes (con pequeñas variaciones entre camps donde aplica)
-- Columna izquierda = 0, derecha = 1
INSERT INTO public.camp_faqs (camp_id, question, answer, col_index, sort_order)
SELECT c.id, q.question, q.answer, q.col_index, q.sort_order
FROM public.surf_camps c
CROSS JOIN (VALUES
  ('¿Dónde está ubicado el Surf Camp y cómo funciona el transporte?',
   'Ubicación: Roche, Cádiz, a 2 min de la playa (dos villas unidas). Transporte incluido (ida y vuelta): te recogemos en los aeropuertos de Jerez o Sevilla, o en la estación de tren San Fernando - Bahía Sur.',
   0, 0),
  ('¿Qué incluyen las comidas y las actividades?',
   'Comidas: pensión completa (desayunos, comidas, cenas y BBQ de bienvenida). Una cena es libre para disfrutar de la gastronomía local. Actividades: 3 clases de surf con monitor + material 24h, parque de tirolinas, rutas en la naturaleza, pool parties y atardeceres en la villa.',
   0, 1),
  ('¿Qué nivel necesito y cuántas plazas hay?',
   'Nivel necesario: ninguno. Las clases se adaptan desde iniciación hasta avanzados. Plazas: máximo 17 personas para asegurar comodidad y buen ambiente.',
   0, 2),
  ('¿Puedo ir solo/a?',
   'Sí, rotundamente. La mayoría de viajeros vienen solos y el viaje está diseñado para integrar al grupo desde el primer momento.',
   0, 3),
  ('¿Alergias o dietas especiales?',
   'Sin problema. Avísanos al reservar (vegetariano, celíaco, alergias) y adaptamos tu menú.',
   0, 4),
  ('¿Qué tengo que llevar?',
   'Bañador, toalla de playa, ropa cómoda y tus cosas de aseo. Nosotros ponemos sábanas y todo el material de surf.',
   1, 0),
  ('¿Hay gastos extra?',
   'Solo la cena libre y tus gastos personales (alguna copa o souvenir). El resto está incluido.',
   1, 1),
  ('¿Cómo son las habitaciones?',
   'Hay variedad de habitaciones, desde individuales hasta compartidas. La distribución se organiza directamente en el check-in según disponibilidad.',
   1, 2),
  ('Edad mínima',
   'La edad mínima para nuestros Surf Camps es de 18 años.',
   1, 3)
) AS q(question, answer, col_index, sort_order)
WHERE c.slug IN (
  'surf-camp-10abril-13abril',
  'surf-camp-16-19-abril-sambatrips',
  'surf-camp-9-13-septiembre-sambatrips'
);
