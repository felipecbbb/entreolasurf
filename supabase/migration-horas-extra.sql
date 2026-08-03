-- Migration: Control Horario — horas extra por monitor y semana
-- ============================================================
-- Cada monitor (categoría 'monitor' y 'carpa') puede tener horas extra en una
-- semana concreta. Se guardan aparte de los turnos diarios porque son un ajuste
-- semanal, no un día trabajado: una celda por monitor en la fila EXTRA.
-- El importe = hours * payroll_config.hora_extra (tarifa global, editable desde
-- el botón "Tarifas") y se suma al PAGO de esa semana.
-- Acceso: admin + encargado con la sección 'control-horario' (misma RLS que el
-- resto de la sección: quien la tiene, la tiene entera).
-- Ejecutar en el SQL Editor de Supabase.

-- 1. Tarifa global de hora extra
alter table public.payroll_config add column if not exists hora_extra numeric(10,2) not null default 10;

-- 2. Horas extra por monitor y semana (week_start = lunes de la semana)
create table if not exists public.monitor_extra_hours (
  id          uuid primary key default gen_random_uuid(),
  monitor_id  uuid not null references public.monitors(id) on delete cascade,
  week_start  date not null,
  hours       numeric(6,2) not null default 0,
  note        text,
  updated_at  timestamptz not null default now(),
  unique (monitor_id, week_start)
);
alter table public.monitor_extra_hours enable row level security;
drop policy if exists "Staff manage monitor extra hours" on public.monitor_extra_hours;
create policy "Staff manage monitor extra hours" on public.monitor_extra_hours for all
  using (public.enc_can(array['control-horario'])) with check (public.enc_can(array['control-horario']));
create index if not exists idx_monitor_extra_week on public.monitor_extra_hours(week_start);

select pg_notify('pgrst', 'reload schema');
