-- Fotos principales de los camps: fuera la marca de agua de la inmobiliaria
-- ============================================================
-- surf_camps.hero_image manda sobre el HTML: camp-overview.js sustituye la
-- foto de cada tarjeta (home y /surf-camp/) y camp-page.js pinta el hero de la
-- ficha con ese valor. Por eso cambiar el HTML no bastaba.
--
-- Las que había son del reportaje de la inmobiliaria y llevan "FlowerStone
-- Real Estate" estampado — se veía en la tarjeta del camp de septiembre.
-- Se cambian por las fotos limpias de la villa.
-- Ejecutar en el SQL Editor de Supabase.

update public.surf_camps set hero_image = '/uploads/2026/08/villa/villa-32.webp', updated_at = now()
where slug = 'surf-camp-10-13-septiembre';

update public.surf_camps set hero_image = '/uploads/2026/08/villa/villa-09.webp', updated_at = now()
where slug = 'surf-camp-10abril-13abril';

update public.surf_camps set hero_image = '/uploads/2026/08/villa/villa-05.webp', updated_at = now()
where slug = 'surf-camp-16-19-abril-sambatrips';

update public.surf_camps set hero_image = '/uploads/2026/08/villa/villa-27.webp', updated_at = now()
where slug = 'surf-camp-20-23-marzo';

-- Comprobación: ninguna debe apuntar ya a /uploads/2025/12/ ni a DJI_0128
select slug, hero_image from public.surf_camps order by date_start;
