-- ============================================================
-- Migration: Control Horario — horas/turnos de instructores
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query
-- ============================================================
--
-- · instructor_shifts: cada bloque de horas trabajadas por un
--   instructor (staff). instructor_id → profiles(id) porque un
--   instructor ES un perfil staff (admin/encargado); la lista
--   sale de profiles role IN ('admin','encargado').
-- · La tarifa/hora editable vive en profiles.hourly_rate. Se
--   copia un snapshot (hourly_rate) en cada turno al crearlo,
--   para que cambiar la tarifa luego NO reescriba el coste ya
--   anotado (histórico estable).
-- · RLS: solo staff (admin + encargado) con la sección
--   'control-horario' concedida → public.enc_can(['control-horario']).
-- ============================================================

-- 1. Tarifa por hora del instructor (editable, en profiles)
alter table public.profiles
  add column if not exists hourly_rate numeric(10,2);

-- 2. Tabla de turnos / horas
create table if not exists public.instructor_shifts (
  id            uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.profiles(id) on delete cascade,
  work_date     date not null,
  start_time    time not null,
  end_time      time not null,
  -- snapshot de la tarifa vigente al crear el turno (histórico estable)
  hourly_rate   numeric(10,2),
  notes         text,
  created_at    timestamptz not null default now(),
  -- la salida debe ser posterior a la entrada
  constraint instructor_shifts_time_order check (end_time > start_time)
);

comment on table public.instructor_shifts is 'Control Horario: horas trabajadas por instructor (staff)';

-- 3. Habilitar RLS
alter table public.instructor_shifts enable row level security;

-- 4. Política staff: admin siempre; encargado con la sección concedida
drop policy if exists "Staff manage instructor shifts" on public.instructor_shifts;
create policy "Staff manage instructor shifts"
  on public.instructor_shifts for all
  using (public.enc_can(array['control-horario']))
  with check (public.enc_can(array['control-horario']));

-- 5. Índices para el listado por instructor y por día
create index if not exists idx_instructor_shifts_instructor
  on public.instructor_shifts(instructor_id, work_date);
create index if not exists idx_instructor_shifts_date
  on public.instructor_shifts(work_date);

-- 6. Refrescar el cache de esquema de PostgREST
select pg_notify('pgrst', 'reload schema');
