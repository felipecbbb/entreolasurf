-- Migration: Control Horario v2 — monitores propios + rejilla tipo Excel
-- ============================================================
-- Los monitores NO son cuentas del sistema: son una lista propia (nombre + categoría
-- + tarifa). Dos categorías: 'monitor' (pago por horas) y 'carpa' (pago fijo por día:
-- día corto / día largo / trabaja). El seguimiento es una rejilla semanal (fechas en
-- filas, monitores en columnas) con TOTAL y PAGO por semana, igual que el Excel.
-- Incluye el seed de los 13 monitores y la importación de las 2 semanas con datos
-- (22-jun a 05-jul 2026) del Excel "SEGUIMIENTO HORAS MONITORES 2026".
-- Ejecutar en el SQL Editor de Supabase.

-- 1. Lista de monitores
create table if not exists public.monitors (
  id               uuid primary key default gen_random_uuid(),
  name             text not null unique,
  category         text not null default 'monitor',    -- 'monitor' (horas) | 'carpa' (día fijo)
  default_pay_type text not null default 'hora',        -- 'hora'|'dia_largo'|'dia_corto'|'trabaja'|'fija'
  hourly_rate      numeric(10,2),                        -- €/h para categoría 'monitor'
  fixed_rate       numeric(10,2),                        -- importe si su tarifa por defecto es 'fija'
  active           boolean not null default true,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now()
);
alter table public.monitors enable row level security;
drop policy if exists "Staff manage monitors" on public.monitors;
create policy "Staff manage monitors" on public.monitors for all
  using (public.enc_can(array['control-horario'])) with check (public.enc_can(array['control-horario']));

-- 2. Turno por monitor y día (una celda de la rejilla)
create table if not exists public.monitor_shifts (
  id          uuid primary key default gen_random_uuid(),
  monitor_id  uuid not null references public.monitors(id) on delete cascade,
  work_date   date not null,
  pay_type    text not null default 'hora',              -- 'hora'|'dia_largo'|'dia_corto'|'trabaja'|'fija'
  hours       numeric(6,2),                              -- horas si pay_type='hora'
  note        text,
  created_at  timestamptz not null default now(),
  unique (monitor_id, work_date)
);
alter table public.monitor_shifts enable row level security;
drop policy if exists "Staff manage monitor shifts" on public.monitor_shifts;
create policy "Staff manage monitor shifts" on public.monitor_shifts for all
  using (public.enc_can(array['control-horario'])) with check (public.enc_can(array['control-horario']));
create index if not exists idx_monitor_shifts_date on public.monitor_shifts(work_date);

-- 3. Tarifa "trabaja" (tercer tipo de día) en la config global (día corto/largo ya existen)
alter table public.payroll_config add column if not exists dia_trabaja numeric(10,2) not null default 36;

-- Fijar las tarifas de día a las del Excel (día corto 63, largo 70, trabaja 36 -a confirmar-)
update public.payroll_config set dia_corto = 63, dia_largo = 70, dia_trabaja = 36 where id = 1;

-- Seed de monitores + import de las 2 semanas con datos (22-jun a 05-jul 2026)
-- Generado desde SEGUIMIENTO HORAS MONITORES 2026.xlsx
begin;
insert into public.monitors (name, category, default_pay_type, hourly_rate, sort_order) values ('DANI', 'monitor', 'hora', 10, 0) on conflict (name) do nothing;
insert into public.monitors (name, category, default_pay_type, hourly_rate, sort_order) values ('GONZALO', 'monitor', 'hora', 10, 1) on conflict (name) do nothing;
insert into public.monitors (name, category, default_pay_type, hourly_rate, sort_order) values ('DARIO', 'monitor', 'hora', 10, 2) on conflict (name) do nothing;
insert into public.monitors (name, category, default_pay_type, hourly_rate, sort_order) values ('CARMEN MORENO', 'monitor', 'hora', 10, 3) on conflict (name) do nothing;
insert into public.monitors (name, category, default_pay_type, hourly_rate, sort_order) values ('IGNACIO', 'monitor', 'hora', 10, 4) on conflict (name) do nothing;
insert into public.monitors (name, category, default_pay_type, hourly_rate, sort_order) values ('JUANMA NOGALES', 'monitor', 'hora', 10, 5) on conflict (name) do nothing;
insert into public.monitors (name, category, default_pay_type, hourly_rate, sort_order) values ('NACHO GUZMAN', 'monitor', 'hora', 10, 6) on conflict (name) do nothing;
insert into public.monitors (name, category, default_pay_type, hourly_rate, sort_order) values ('MARIO', 'monitor', 'hora', 10, 7) on conflict (name) do nothing;
insert into public.monitors (name, category, default_pay_type, hourly_rate, sort_order) values ('CARMEN ALONSO', 'monitor', 'hora', 10, 8) on conflict (name) do nothing;
insert into public.monitors (name, category, default_pay_type, hourly_rate, sort_order) values ('JUANMA DE GOMAR', 'monitor', 'hora', 10, 9) on conflict (name) do nothing;
insert into public.monitors (name, category, default_pay_type, hourly_rate, sort_order) values ('CARPA Juanma', 'carpa', 'dia_corto', null, 10) on conflict (name) do nothing;
insert into public.monitors (name, category, default_pay_type, hourly_rate, sort_order) values ('CARPA Lolo', 'carpa', 'dia_corto', null, 11) on conflict (name) do nothing;
insert into public.monitors (name, category, default_pay_type, hourly_rate, sort_order) values ('NICO', 'carpa', 'dia_corto', null, 12) on conflict (name) do nothing;

-- Turnos (hours o tipo de día). amount se calcula luego con las tarifas; aquí solo tipo/horas.
insert into public.monitor_shifts (monitor_id, work_date, pay_type, hours) select id, '2026-06-22', 'hora', 1.5 from public.monitors where name='JUANMA DE GOMAR' on conflict (monitor_id, work_date) do nothing;
insert into public.monitor_shifts (monitor_id, work_date, pay_type, hours) select id, '2026-06-22', 'hora', 7.5 from public.monitors where name='NICO' on conflict (monitor_id, work_date) do nothing;
insert into public.monitor_shifts (monitor_id, work_date, pay_type, hours) select id, '2026-06-23', 'hora', 4.0 from public.monitors where name='NICO' on conflict (monitor_id, work_date) do nothing;
insert into public.monitor_shifts (monitor_id, work_date, pay_type, hours) select id, '2026-06-24', 'dia_corto', null from public.monitors where name='CARPA Lolo' on conflict (monitor_id, work_date) do nothing;
insert into public.monitor_shifts (monitor_id, work_date, pay_type, hours) select id, '2026-06-25', 'hora', 1.5 from public.monitors where name='DARIO' on conflict (monitor_id, work_date) do nothing;
insert into public.monitor_shifts (monitor_id, work_date, pay_type, hours) select id, '2026-06-25', 'dia_corto', null from public.monitors where name='CARPA Juanma' on conflict (monitor_id, work_date) do nothing;
insert into public.monitor_shifts (monitor_id, work_date, pay_type, hours) select id, '2026-06-25', 'trabaja', null from public.monitors where name='NICO' on conflict (monitor_id, work_date) do nothing;
insert into public.monitor_shifts (monitor_id, work_date, pay_type, hours) select id, '2026-06-26', 'dia_corto', null from public.monitors where name='CARPA Juanma' on conflict (monitor_id, work_date) do nothing;
insert into public.monitor_shifts (monitor_id, work_date, pay_type, hours) select id, '2026-06-26', 'trabaja', null from public.monitors where name='NICO' on conflict (monitor_id, work_date) do nothing;
insert into public.monitor_shifts (monitor_id, work_date, pay_type, hours) select id, '2026-06-27', 'dia_corto', null from public.monitors where name='CARPA Juanma' on conflict (monitor_id, work_date) do nothing;
insert into public.monitor_shifts (monitor_id, work_date, pay_type, hours) select id, '2026-06-27', 'trabaja', null from public.monitors where name='NICO' on conflict (monitor_id, work_date) do nothing;
insert into public.monitor_shifts (monitor_id, work_date, pay_type, hours) select id, '2026-06-28', 'dia_corto', null from public.monitors where name='NICO' on conflict (monitor_id, work_date) do nothing;
insert into public.monitor_shifts (monitor_id, work_date, pay_type, hours) select id, '2026-06-29', 'hora', 1.5 from public.monitors where name='DANI' on conflict (monitor_id, work_date) do nothing;
insert into public.monitor_shifts (monitor_id, work_date, pay_type, hours) select id, '2026-06-29', 'hora', 3.0 from public.monitors where name='GONZALO' on conflict (monitor_id, work_date) do nothing;
insert into public.monitor_shifts (monitor_id, work_date, pay_type, hours) select id, '2026-06-29', 'dia_corto', null from public.monitors where name='CARPA Juanma' on conflict (monitor_id, work_date) do nothing;
insert into public.monitor_shifts (monitor_id, work_date, pay_type, hours) select id, '2026-06-29', 'trabaja', null from public.monitors where name='NICO' on conflict (monitor_id, work_date) do nothing;
insert into public.monitor_shifts (monitor_id, work_date, pay_type, hours) select id, '2026-06-30', 'hora', 3.5 from public.monitors where name='DANI' on conflict (monitor_id, work_date) do nothing;
insert into public.monitor_shifts (monitor_id, work_date, pay_type, hours) select id, '2026-06-30', 'hora', 1.5 from public.monitors where name='GONZALO' on conflict (monitor_id, work_date) do nothing;
insert into public.monitor_shifts (monitor_id, work_date, pay_type, hours) select id, '2026-06-30', 'hora', 3.5 from public.monitors where name='DARIO' on conflict (monitor_id, work_date) do nothing;
insert into public.monitor_shifts (monitor_id, work_date, pay_type, hours) select id, '2026-06-30', 'dia_corto', null from public.monitors where name='CARPA Juanma' on conflict (monitor_id, work_date) do nothing;
insert into public.monitor_shifts (monitor_id, work_date, pay_type, hours) select id, '2026-06-30', 'trabaja', null from public.monitors where name='NICO' on conflict (monitor_id, work_date) do nothing;
insert into public.monitor_shifts (monitor_id, work_date, pay_type, hours) select id, '2026-07-01', 'hora', 3.5 from public.monitors where name='DANI' on conflict (monitor_id, work_date) do nothing;
insert into public.monitor_shifts (monitor_id, work_date, pay_type, hours) select id, '2026-07-01', 'hora', 1.5 from public.monitors where name='GONZALO' on conflict (monitor_id, work_date) do nothing;
insert into public.monitor_shifts (monitor_id, work_date, pay_type, hours) select id, '2026-07-01', 'dia_corto', null from public.monitors where name='CARPA Juanma' on conflict (monitor_id, work_date) do nothing;
insert into public.monitor_shifts (monitor_id, work_date, pay_type, hours) select id, '2026-07-01', 'trabaja', null from public.monitors where name='NICO' on conflict (monitor_id, work_date) do nothing;
insert into public.monitor_shifts (monitor_id, work_date, pay_type, hours) select id, '2026-07-02', 'hora', 1.5 from public.monitors where name='GONZALO' on conflict (monitor_id, work_date) do nothing;
insert into public.monitor_shifts (monitor_id, work_date, pay_type, hours) select id, '2026-07-02', 'hora', 1.5 from public.monitors where name='DARIO' on conflict (monitor_id, work_date) do nothing;
insert into public.monitor_shifts (monitor_id, work_date, pay_type, hours) select id, '2026-07-02', 'dia_largo', null from public.monitors where name='CARPA Lolo' on conflict (monitor_id, work_date) do nothing;
insert into public.monitor_shifts (monitor_id, work_date, pay_type, hours) select id, '2026-07-02', 'trabaja', null from public.monitors where name='NICO' on conflict (monitor_id, work_date) do nothing;
insert into public.monitor_shifts (monitor_id, work_date, pay_type, hours) select id, '2026-07-04', 'hora', 1.5 from public.monitors where name='DANI' on conflict (monitor_id, work_date) do nothing;
insert into public.monitor_shifts (monitor_id, work_date, pay_type, hours) select id, '2026-07-04', 'dia_corto', null from public.monitors where name='CARPA Lolo' on conflict (monitor_id, work_date) do nothing;
insert into public.monitor_shifts (monitor_id, work_date, pay_type, hours) select id, '2026-07-05', 'dia_corto', null from public.monitors where name='CARPA Lolo' on conflict (monitor_id, work_date) do nothing;
commit;

select pg_notify('pgrst', 'reload schema');
