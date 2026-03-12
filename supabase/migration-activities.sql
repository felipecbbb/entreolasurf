-- ============================================================
-- Migración: Sistema de actividades para Entre Olas Surf
-- ============================================================

-- 1. TABLAS
create table if not exists public.activities (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique,
  type_key text not null unique,
  nombre text not null,
  nombre_interno text,
  descripcion text,
  hero_image text,
  hero_title text,
  hero_subtitle text,
  hero_kicker text,
  pre_section_kicker text,
  pre_section_title text,
  pre_section_lead text,
  whats_included jsonb default '[]'::jsonb,
  whats_included_title text default '¿Qué incluye cada clase?',
  ideal_for jsonb default '[]'::jsonb,
  ideal_for_title text default 'Ideal para',
  duracion int,
  capacidad_max int,
  ubicacion text default 'Playa de Roche',
  color text default '#0f2f39',
  deposit numeric(8,2) not null default 15,
  pack_validity int not null default 180,
  meta_title text,
  meta_description text,
  activo boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_packs (
  id uuid primary key default uuid_generate_v4(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  sessions int not null check (sessions > 0),
  price numeric(8,2) not null,
  featured boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique(activity_id, sessions)
);

create table if not exists public.activity_photos (
  id uuid primary key default uuid_generate_v4(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  url text not null,
  alt_text text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_testimonials (
  id uuid primary key default uuid_generate_v4(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  author_name text not null,
  quote text not null,
  stars int not null default 5 check (stars >= 1 and stars <= 5),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_faqs (
  id uuid primary key default uuid_generate_v4(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  question text not null,
  answer text not null,
  col_index int not null default 0 check (col_index in (0, 1)),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- 2. ÍNDICES
create index if not exists idx_activity_packs_aid on public.activity_packs(activity_id);
create index if not exists idx_activity_photos_aid on public.activity_photos(activity_id);
create index if not exists idx_activity_test_aid on public.activity_testimonials(activity_id);
create index if not exists idx_activity_faqs_aid on public.activity_faqs(activity_id);

-- 3. RLS
alter table public.activities enable row level security;
drop policy if exists "act_sel" on public.activities;
create policy "act_sel" on public.activities for select using (true);
drop policy if exists "act_admin" on public.activities;
create policy "act_admin" on public.activities for all using (public.is_admin());

alter table public.activity_packs enable row level security;
drop policy if exists "pk_sel" on public.activity_packs;
create policy "pk_sel" on public.activity_packs for select using (true);
drop policy if exists "pk_admin" on public.activity_packs;
create policy "pk_admin" on public.activity_packs for all using (public.is_admin());

alter table public.activity_photos enable row level security;
drop policy if exists "ph_sel" on public.activity_photos;
create policy "ph_sel" on public.activity_photos for select using (true);
drop policy if exists "ph_admin" on public.activity_photos;
create policy "ph_admin" on public.activity_photos for all using (public.is_admin());

alter table public.activity_testimonials enable row level security;
drop policy if exists "ts_sel" on public.activity_testimonials;
create policy "ts_sel" on public.activity_testimonials for select using (true);
drop policy if exists "ts_admin" on public.activity_testimonials;
create policy "ts_admin" on public.activity_testimonials for all using (public.is_admin());

alter table public.activity_faqs enable row level security;
drop policy if exists "fq_sel" on public.activity_faqs;
create policy "fq_sel" on public.activity_faqs for select using (true);
drop policy if exists "fq_admin" on public.activity_faqs;
create policy "fq_admin" on public.activity_faqs for all using (public.is_admin());

-- 4. BONOS: añadir activity_id
alter table public.bonos add column if not exists activity_id uuid references public.activities(id);
create index if not exists idx_bonos_activity_id on public.bonos(activity_id);

-- ============================================================
-- 5. SEED: Actividades (sin JSONB inline, se actualizan después)
-- ============================================================

insert into public.activities (slug, type_key, nombre, nombre_interno, descripcion, hero_image, hero_title, hero_subtitle, hero_kicker, pre_section_kicker, pre_section_title, pre_section_lead, whats_included_title, ideal_for_title, duracion, capacidad_max, ubicacion, color, deposit, pack_validity, meta_title, meta_description, activo, sort_order)
values (
  'clases-de-surf-grupales', 'grupal', 'Clases Grupales', 'Clase grupal de surf',
  'Clases de surf grupales en Entre Olas: 90 min, max 6 personas, material incluido.',
  'https://entreolasurf.com/wp-content/uploads/2025/12/11.png',
  'Aprende surf en la mejor compañía',
  '90 minutos · Máx. 6 personas · Material incluido · Todos los niveles',
  'Clases de Surf Grupales',
  'Elige tu pack', 'Cuantas más clases, más ahorras',
  'Todos los packs incluyen material, seguro de accidentes e instructor certificado. Reserva con solo 15€ y paga el resto en la primera clase. Válidos 180 días.',
  '¿Qué incluye cada clase?', 'Ideal para',
  90, 6, 'Playa de Roche', '#0f2f39', 15, 180,
  'Clases de Surf Grupales | Entre Olas',
  'Clases de surf grupales en Entre Olas: 90 min, max 6 personas.',
  true, 0
);

insert into public.activities (slug, type_key, nombre, nombre_interno, descripcion, hero_image, hero_title, hero_subtitle, hero_kicker, pre_section_kicker, pre_section_title, pre_section_lead, whats_included_title, ideal_for_title, duracion, capacidad_max, ubicacion, color, deposit, pack_validity, meta_title, meta_description, activo, sort_order)
values (
  'clases-de-surf-individuales', 'individual', 'Clases Individuales', 'Clase individual de surf',
  'Clases de surf individuales con atención 100% personalizada.',
  'https://entreolasurf.com/wp-content/uploads/2025/12/10.png',
  'Perfecciona tu surf con atención personalizada',
  '90 minutos · 1 persona o grupo privado · Material incluido · Objetivos a medida',
  'Clases de Surf Individuales',
  'Elige tu pack', 'Progresa el doble de rápido',
  'Clases privadas con instructor exclusivo. Reserva con solo 15€ y paga el resto en la primera clase. Válidos 180 días.',
  '¿Por qué elegir clases privadas?', 'Ideal para',
  90, 1, 'Playa de Roche', '#2d6a4f', 15, 180,
  'Clases de Surf Individuales | Entre Olas',
  'Clases de surf individuales con atención personalizada.',
  true, 1
);

insert into public.activities (slug, type_key, nombre, nombre_interno, descripcion, hero_image, hero_title, hero_subtitle, hero_kicker, pre_section_kicker, pre_section_title, pre_section_lead, whats_included_title, ideal_for_title, duracion, capacidad_max, ubicacion, color, deposit, pack_validity, meta_title, meta_description, activo, sort_order)
values (
  'clases-de-yoga', 'yoga', 'Clases de Yoga', 'Clase de yoga',
  'Clases de yoga para complementar tu experiencia en el agua.',
  'https://entreolasurf.com/wp-content/uploads/2026/02/CasadeRoche017.webp',
  'Equilibrio y bienestar holístico en Roche',
  'Grupos reducidos · Material incluido · Todos los niveles · Validez 365 días',
  'Clases de Yoga',
  'Elige tu pack', 'Cuantas más clases, más ahorras',
  'Yoga para encontrar armonía entre cuerpo y mente. Reserva con solo 15€. Válidos 365 días.',
  '¿Por qué yoga con nosotros?', 'Ideal para',
  60, 10, 'Playa de Roche', '#7c3aed', 15, 365,
  'Clases de Yoga | Entre Olas',
  'Clases de yoga en Roche para complementar tu surf.',
  true, 2
);

insert into public.activities (slug, type_key, nombre, nombre_interno, descripcion, hero_image, hero_title, hero_subtitle, hero_kicker, pre_section_kicker, pre_section_title, pre_section_lead, whats_included_title, ideal_for_title, duracion, capacidad_max, ubicacion, color, deposit, pack_validity, meta_title, meta_description, activo, sort_order)
values (
  'paddle-surf', 'paddle', 'Paddle Surf', 'Clase de paddle surf',
  'Clases de Paddle Surf con instructores certificados y rutas guiadas.',
  'https://entreolasurf.com/wp-content/uploads/2026/02/DJI_0070.webp',
  'Descubre la tranquilidad del mar sobre una tabla de SUP',
  'Desde 6 años · Material incluido · Grupos reducidos · Validez 365 días',
  'Paddle Surf',
  'Elige tu pack', 'Cuantas más clases, más ahorras',
  'Combina ejercicio, relajación y naturaleza. Reserva con solo 15€. Válidos 365 días.',
  '¿Por qué paddle surf con nosotros?', 'Ideal para',
  90, 8, 'Playa de Roche', '#0369a1', 15, 365,
  'Paddle Surf | Entre Olas',
  'Clases de Paddle Surf con rutas guiadas en Conil.',
  true, 3
);

insert into public.activities (slug, type_key, nombre, nombre_interno, descripcion, hero_image, hero_title, hero_subtitle, hero_kicker, pre_section_kicker, pre_section_title, pre_section_lead, whats_included_title, ideal_for_title, duracion, capacidad_max, ubicacion, color, deposit, pack_validity, meta_title, meta_description, activo, sort_order)
values (
  'clases-de-surfskate', 'surfskate', 'SurfSkate', 'Clase de surf skate',
  'Clases de SurfSkate para mejorar técnica de giro y equilibrio.',
  'https://entreolasurf.com/wp-content/uploads/2026/02/IV0A8127.webp',
  'Mejora tu técnica de surf en tierra firme',
  '1,5 h por sesión · Material incluido · Todos los niveles · Validez 365 días',
  'Clases de Surf Skate',
  'Elige tu pack', 'Cuantas más clases, más ahorras',
  'Entrena giros y coordinación con instructores especialistas. Reserva con solo 15€. Válidos 365 días.',
  '¿Por qué surf skate con nosotros?', 'Ideal para',
  90, 8, 'Playa de Roche', '#c2410c', 15, 365,
  'Clases de SurfSkate | Entre Olas',
  'Clases de SurfSkate para mejorar tu surf en tierra.',
  true, 4
);

-- 6. UPDATE JSONB con jsonb_build_array (evita problemas de line breaks)

update public.activities set whats_included = jsonb_build_array(
  'Tabla de surf', 'Neopreno', 'Seguro de accidentes',
  'Instructor certificado', 'Teoría + práctica',
  'Grupos máx. 6 personas', 'Todos los niveles', '90 minutos'
), ideal_for = jsonb_build_array(
  'Principiantes que quieren aprender en un ambiente motivador.',
  'Surfistas que buscan progresar con feedback de instructores.',
  'Grupos de amigos que quieren compartir la experiencia.',
  'Quien busca la mejor relación calidad-precio.'
) where type_key = 'grupal';

update public.activities set whats_included = jsonb_build_array(
  'Atención 100% personalizada', 'Progreso más rápido y efectivo',
  'Flexibilidad total de horarios', 'Objetivos específicos',
  'Correcciones en tiempo real', 'Ritmo adaptado a ti'
), ideal_for = jsonb_build_array(
  'Principiantes que prefieren atención individual sin prisas.',
  'Surfistas intermedios que quieren perfeccionar maniobras.',
  'Parejas o familias que quieren aprender juntos en privado.',
  'Personas con horarios complicados que necesitan flexibilidad.'
) where type_key = 'individual';

update public.activities set whats_included = jsonb_build_array(
  'Complemento al surf', 'Instructores certificados',
  'Material incluido', 'Grupos reducidos',
  'Todas las edades', 'Ubicación perfecta'
), ideal_for = jsonb_build_array(
  'Mejora tu flexibilidad, fuerza y enfoque para rendir más sobre la tabla.',
  'Profesionales con formación en yoga que adaptan la clase a cada nivel.',
  'Esterilla y todo lo que necesitas para la práctica sin preocupaciones.',
  'Atención personalizada para que aproveches al máximo cada sesión.'
) where type_key = 'yoga';

update public.activities set whats_included = jsonb_build_array(
  'Ejercicio completo', 'Material de calidad',
  'Instructores certificados', 'Grupos reducidos',
  'Rutas guiadas', 'Todas las edades'
), ideal_for = jsonb_build_array(
  'Trabaja todo el cuerpo, especialmente el core, de forma suave.',
  'Tabla SUP, remo y chaleco incluidos en cada sesión.',
  'Profesionales con experiencia que adaptan la clase a cada nivel.',
  'Explora calas escondidas y acantilados de la costa gaditana.'
) where type_key = 'paddle';

update public.activities set whats_included = jsonb_build_array(
  'Mejora técnica de giro', 'Memoria muscular',
  'Análisis de video', 'Instructores surfistas',
  'Sin depender del mar', 'Para todos los niveles'
), ideal_for = jsonb_build_array(
  'Entrena bottom turns, cutbacks y generación de velocidad fuera del agua.',
  'Desarrolla patrones de movimiento que se transfieren al surf.',
  'Grabamos y analizamos tu técnica para corregir y progresar.',
  'Instructores surfistas experimentados y especialistas en surf skate.'
) where type_key = 'surfskate';

-- 7. PACKS
insert into public.activity_packs (activity_id, sessions, price, featured, sort_order) values
  ((select id from public.activities where type_key='grupal'), 1, 35, false, 0),
  ((select id from public.activities where type_key='grupal'), 2, 65, false, 1),
  ((select id from public.activities where type_key='grupal'), 3, 90, false, 2),
  ((select id from public.activities where type_key='grupal'), 4, 115, false, 3),
  ((select id from public.activities where type_key='grupal'), 5, 135, true, 4),
  ((select id from public.activities where type_key='grupal'), 6, 155, false, 5),
  ((select id from public.activities where type_key='grupal'), 7, 165, false, 6);

insert into public.activity_packs (activity_id, sessions, price, featured, sort_order) values
  ((select id from public.activities where type_key='individual'), 1, 69, false, 0),
  ((select id from public.activities where type_key='individual'), 2, 130, false, 1),
  ((select id from public.activities where type_key='individual'), 3, 177, true, 2),
  ((select id from public.activities where type_key='individual'), 4, 220, false, 3),
  ((select id from public.activities where type_key='individual'), 5, 250, false, 4);

insert into public.activity_packs (activity_id, sessions, price, featured, sort_order) values
  ((select id from public.activities where type_key='yoga'), 1, 20, false, 0),
  ((select id from public.activities where type_key='yoga'), 2, 35, false, 1),
  ((select id from public.activities where type_key='yoga'), 3, 48, false, 2),
  ((select id from public.activities where type_key='yoga'), 4, 60, false, 3),
  ((select id from public.activities where type_key='yoga'), 5, 70, true, 4),
  ((select id from public.activities where type_key='yoga'), 6, 75, false, 5);

insert into public.activity_packs (activity_id, sessions, price, featured, sort_order) values
  ((select id from public.activities where type_key='paddle'), 1, 49, false, 0),
  ((select id from public.activities where type_key='paddle'), 2, 95, false, 1),
  ((select id from public.activities where type_key='paddle'), 3, 135, false, 2),
  ((select id from public.activities where type_key='paddle'), 4, 170, false, 3),
  ((select id from public.activities where type_key='paddle'), 5, 205, true, 4),
  ((select id from public.activities where type_key='paddle'), 6, 240, false, 5);

insert into public.activity_packs (activity_id, sessions, price, featured, sort_order) values
  ((select id from public.activities where type_key='surfskate'), 1, 30, false, 0),
  ((select id from public.activities where type_key='surfskate'), 2, 55, false, 1),
  ((select id from public.activities where type_key='surfskate'), 3, 78, false, 2),
  ((select id from public.activities where type_key='surfskate'), 4, 95, false, 3),
  ((select id from public.activities where type_key='surfskate'), 5, 115, true, 4),
  ((select id from public.activities where type_key='surfskate'), 6, 130, false, 5);

-- 8. FOTOS
insert into public.activity_photos (activity_id, url, alt_text, sort_order) values
  ((select id from public.activities where type_key='grupal'), 'https://entreolasurf.com/wp-content/uploads/2025/12/11.png', 'Clase grupal surf', 0),
  ((select id from public.activities where type_key='grupal'), 'https://entreolasurf.com/wp-content/uploads/2025/12/WhatsApp-Image-2025-12-04-at-18.22.11-3.jpeg', 'Alumnos surfeando', 1),
  ((select id from public.activities where type_key='grupal'), 'https://entreolasurf.com/wp-content/uploads/2025/10/Foto-18-7-23-17-18-31-scaled.jpg', 'Instructores', 2);

insert into public.activity_photos (activity_id, url, alt_text, sort_order) values
  ((select id from public.activities where type_key='individual'), 'https://entreolasurf.com/wp-content/uploads/2025/12/10.png', 'Clase individual', 0),
  ((select id from public.activities where type_key='individual'), 'https://entreolasurf.com/wp-content/uploads/2025/10/Foto-18-7-23-17-18-31-scaled.jpg', 'Instructor', 1),
  ((select id from public.activities where type_key='individual'), 'https://entreolasurf.com/wp-content/uploads/2025/12/WhatsApp-Image-2025-12-04-at-18.22.09-1.jpeg', 'Alumno surf', 2);

insert into public.activity_photos (activity_id, url, alt_text, sort_order) values
  ((select id from public.activities where type_key='yoga'), 'https://entreolasurf.com/wp-content/uploads/2026/02/CasadeRoche017.webp', 'Yoga Roche', 0),
  ((select id from public.activities where type_key='yoga'), 'https://entreolasurf.com/wp-content/uploads/2025/10/Foto-18-7-23-17-18-31-scaled.jpg', 'Yoga playa', 1),
  ((select id from public.activities where type_key='yoga'), 'https://entreolasurf.com/wp-content/uploads/2025/12/WhatsApp-Image-2025-12-04-at-18.22.11-3.jpeg', 'Bienestar', 2);

insert into public.activity_photos (activity_id, url, alt_text, sort_order) values
  ((select id from public.activities where type_key='paddle'), 'https://entreolasurf.com/wp-content/uploads/2026/02/DJI_0070.webp', 'Paddle surf aereo', 0),
  ((select id from public.activities where type_key='paddle'), 'https://entreolasurf.com/wp-content/uploads/2026/02/IV0A8103.webp', 'Clase paddle', 1),
  ((select id from public.activities where type_key='paddle'), 'https://entreolasurf.com/wp-content/uploads/2025/12/9.png', 'Material paddle', 2);

insert into public.activity_photos (activity_id, url, alt_text, sort_order) values
  ((select id from public.activities where type_key='surfskate'), 'https://entreolasurf.com/wp-content/uploads/2026/02/IV0A8127.webp', 'Surf skate', 0),
  ((select id from public.activities where type_key='surfskate'), 'https://entreolasurf.com/wp-content/uploads/2025/12/11.png', 'Entrenamiento', 1),
  ((select id from public.activities where type_key='surfskate'), 'https://entreolasurf.com/wp-content/uploads/2025/12/WhatsApp-Image-2025-12-04-at-18.22.09-1.jpeg', 'Giros surfskate', 2);

-- 9. TESTIMONIOS
insert into public.activity_testimonials (activity_id, author_name, quote, stars, sort_order) values
  ((select id from public.activities where type_key='grupal'), 'Laura García', 'Una experiencia increíble. Los instructores son muy profesionales y pacientes. Conseguí ponerme de pie el primer día.', 5, 0),
  ((select id from public.activities where type_key='grupal'), 'Carlos Martínez', 'Aprendí mucho y conocí gente increíble. Las instalaciones son geniales. Recomiendo las clases grupales 100%.', 5, 1),
  ((select id from public.activities where type_key='grupal'), 'Familia Rodríguez', 'Hicimos el curso familiar y fue perfecto. Los niños se lo pasaron genial. Muy recomendable.', 5, 2);

insert into public.activity_testimonials (activity_id, author_name, quote, stars, sort_order) values
  ((select id from public.activities where type_key='individual'), 'Laura García', 'La clase privada fue exactamente lo que necesitaba. El instructor se adaptó a mi nivel perfectamente.', 5, 0),
  ((select id from public.activities where type_key='individual'), 'Carlos Martínez', 'El pack de 3 clases individuales fue la mejor inversión. Pasé de no poder hacer el take-off a surfear olas.', 5, 1),
  ((select id from public.activities where type_key='individual'), 'Familia Rodríguez', 'Hicimos la clase privada en familia. Los instructores se adaptaron a cada uno. Experiencia perfecta.', 5, 2);

insert into public.activity_testimonials (activity_id, author_name, quote, stars, sort_order) values
  ((select id from public.activities where type_key='yoga'), 'Marta López', 'Las clases de yoga me ayudaron a recuperarme después de las sesiones de surf. Un complemento perfecto.', 5, 0),
  ((select id from public.activities where type_key='yoga'), 'Cristina Ruiz', 'Nunca había hecho yoga y las instructoras me hicieron sentir muy cómoda. Ahora es parte de mi rutina.', 5, 1),
  ((select id from public.activities where type_key='yoga'), 'Daniel Fernández', 'Grupos pequeños, buena guía y un entorno espectacular. Se nota la mejoría en la flexibilidad.', 5, 2);

insert into public.activity_testimonials (activity_id, author_name, quote, stars, sort_order) values
  ((select id from public.activities where type_key='paddle'), 'Laura García', 'Una experiencia increíble. Las aguas de Conil son perfectas para paddle surf. Calas preciosas.', 5, 0),
  ((select id from public.activities where type_key='paddle'), 'Familia Rodríguez', 'Ideal para hacer en familia. Los niños de 7 y 9 años lo pasaron genial y aprendieron rápido.', 5, 1),
  ((select id from public.activities where type_key='paddle'), 'Carlos Martínez', 'El pack de 5 clases merece mucho la pena. Cada sesión fuimos a rutas distintas. Espectacular.', 5, 2);

insert into public.activity_testimonials (activity_id, author_name, quote, stars, sort_order) values
  ((select id from public.activities where type_key='surfskate'), 'Pablo Sánchez', 'Noté la mejoría en mi surf después de solo 3 clases de skate. Los giros me salen mucho más fluidos.', 5, 0),
  ((select id from public.activities where type_key='surfskate'), 'Ana Moreno', 'Una forma increíble de entrenar cuando no hay olas. Conectan perfectamente skate con surf real.', 5, 1),
  ((select id from public.activities where type_key='surfskate'), 'Javier Torres', 'El análisis de video marca la diferencia. Ves los errores y los corriges en el momento. Muy profesional.', 5, 2);

-- 10. FAQs
insert into public.activity_faqs (activity_id, question, answer, col_index, sort_order) values
  ((select id from public.activities where type_key='grupal'), '¿Qué incluye cada clase grupal?', '90 min, tabla, neopreno, seguro e instructor certificado. Todos los niveles.', 0, 0),
  ((select id from public.activities where type_key='grupal'), '¿Cuántas personas hay por grupo?', 'Máximo 6 personas por grupo para asegurar atención personalizada.', 0, 1),
  ((select id from public.activities where type_key='grupal'), '¿Necesito experiencia previa?', 'No. Para todos los niveles, desde principiantes hasta surfistas avanzados.', 0, 2),
  ((select id from public.activities where type_key='grupal'), '¿Cómo funciona la reserva?', 'Reservas con 15€ online y el resto se paga en la primera clase.', 1, 0),
  ((select id from public.activities where type_key='grupal'), '¿Cuánto tiempo tengo para usar mi pack?', 'Validez de 180 días desde la compra.', 1, 1),
  ((select id from public.activities where type_key='grupal'), '¿Puedo cambiar de grupal a individual?', 'Sí, contáctanos y te ayudamos a ajustar tu pack.', 1, 2);

insert into public.activity_faqs (activity_id, question, answer, col_index, sort_order) values
  ((select id from public.activities where type_key='individual'), '¿Qué incluye la clase individual?', '90 min con instructor exclusivo, tabla, neopreno, seguro. Todos los niveles.', 0, 0),
  ((select id from public.activities where type_key='individual'), '¿Es solo para una persona?', 'Puede ser para 1 persona o grupo privado (pareja, familia, amigos).', 0, 1),
  ((select id from public.activities where type_key='individual'), '¿Necesito experiencia previa?', 'No. Adaptamos cada clase a tu nivel.', 0, 2),
  ((select id from public.activities where type_key='individual'), '¿Cómo se paga?', 'Reserva de 15€ online y el resto en la primera clase.', 1, 0),
  ((select id from public.activities where type_key='individual'), '¿Cuánto dura la validez del pack?', 'Validez de 180 días desde la compra.', 1, 1),
  ((select id from public.activities where type_key='individual'), '¿También tenéis clases grupales?', 'Sí, desde 35€ con grupos de máximo 6 personas.', 1, 2);

insert into public.activity_faqs (activity_id, question, answer, col_index, sort_order) values
  ((select id from public.activities where type_key='yoga'), '¿Necesito experiencia en yoga?', 'No. Las clases se adaptan a todos los niveles.', 0, 0),
  ((select id from public.activities where type_key='yoga'), '¿Qué trabajamos en clase?', 'Respiración, posturas (asanas) y relajación para fortalecer cuerpo y mente.', 0, 1),
  ((select id from public.activities where type_key='yoga'), '¿Cuánto pago al reservar?', 'Solo 15€ de señal. El resto en la primera clase.', 0, 2),
  ((select id from public.activities where type_key='yoga'), '¿Cuánto tiempo dura la validez?', 'Packs de yoga: validez de 365 días. Sin prisas.', 1, 0),
  ((select id from public.activities where type_key='yoga'), '¿Necesito traer esterilla?', 'No. Todo el material incluido: esterillas, bloques, accesorios.', 1, 1),
  ((select id from public.activities where type_key='yoga'), '¿Ayuda a mejorar en el surf?', 'Sí. Mejora flexibilidad, equilibrio y concentración para el surf.', 1, 2);

insert into public.activity_faqs (activity_id, question, answer, col_index, sort_order) values
  ((select id from public.activities where type_key='paddle'), '¿Necesito experiencia previa?', 'No. Comenzamos con técnica básica en aguas tranquilas.', 0, 0),
  ((select id from public.activities where type_key='paddle'), '¿Qué incluye la clase?', 'Tabla SUP, remo, chaleco e instructores certificados.', 0, 1),
  ((select id from public.activities where type_key='paddle'), '¿Cuál es la edad mínima?', 'Desde 6 años. Actividad segura para todas las edades.', 0, 2),
  ((select id from public.activities where type_key='paddle'), '¿Cuánto pago al reservar?', 'Solo 15€ de señal. El resto en la primera clase.', 1, 0),
  ((select id from public.activities where type_key='paddle'), '¿Cuánto dura la validez?', '365 días desde la compra. Un año completo.', 1, 1),
  ((select id from public.activities where type_key='paddle'), '¿Hacemos rutas o solo clase?', 'Combinamos técnica y rutas guiadas por calas y acantilados.', 1, 2);

insert into public.activity_faqs (activity_id, question, answer, col_index, sort_order) values
  ((select id from public.activities where type_key='surfskate'), '¿Me sirve si soy principiante?', 'Sí. Ideal para principiantes y surfistas avanzados.', 0, 0),
  ((select id from public.activities where type_key='surfskate'), '¿Qué duración tienen las clases?', '1,5 horas: calentamiento, ejercicios técnicos, circuitos y análisis.', 0, 1),
  ((select id from public.activities where type_key='surfskate'), '¿Necesito traer mi propio skate?', 'No. Material incluido: surf skate, protecciones y casco.', 0, 2),
  ((select id from public.activities where type_key='surfskate'), '¿Cuánto pago al reservar?', 'Solo 15€ de señal. El resto en la primera clase.', 1, 0),
  ((select id from public.activities where type_key='surfskate'), '¿Cuánto dura la validez?', '365 días desde la compra.', 1, 1),
  ((select id from public.activities where type_key='surfskate'), '¿Realmente mejora mi surf?', 'Sí. Transferencia directa: giros, velocidad, equilibrio y coordinación.', 1, 2);

-- 11. BACKFILL bonos
update public.bonos set activity_id = (select id from public.activities where type_key = bonos.class_type) where activity_id is null;
