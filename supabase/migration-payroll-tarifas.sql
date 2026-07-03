-- Migration: Control Horario — tarifas fijas por día (largo/corto/fija) + por hora
-- ============================================================
-- Amplía el pago de instructores: además de "por hora", permite pagar un importe
-- FIJO por día (día largo, día corto o tarifa fija a medida), independiente de las horas.
-- Los importes de día largo/corto son globales y editables; cada empleado tiene una
-- tarifa por defecto; cada turno guarda su tipo e importe (snapshot histórico estable).
-- Ejecutar en el SQL Editor de Supabase.

-- 1. Config global de día largo / día corto (fila única, editable)
create table if not exists public.payroll_config (
  id         smallint primary key default 1,
  dia_largo  numeric(10,2) not null default 70,
  dia_corto  numeric(10,2) not null default 62,
  updated_at timestamptz not null default now(),
  constraint payroll_config_singleton check (id = 1)
);
insert into public.payroll_config (id) values (1) on conflict (id) do nothing;
alter table public.payroll_config enable row level security;
drop policy if exists "Staff manage payroll config" on public.payroll_config;
create policy "Staff manage payroll config" on public.payroll_config for all
  using (public.enc_can(array['control-horario']))
  with check (public.enc_can(array['control-horario']));

-- 2. Tarifa por defecto de cada empleado + importe para 'fija'
alter table public.profiles
  add column if not exists default_pay_type text,    -- 'hora' | 'dia_largo' | 'dia_corto' | 'fija'
  add column if not exists fixed_rate numeric(10,2); -- importe cuando su tarifa por defecto es 'fija'

-- 3. Tipo e importe por turno (snapshot estable; 'hora' por defecto para no romper histórico)
alter table public.instructor_shifts
  add column if not exists pay_type text not null default 'hora',
  add column if not exists fixed_amount numeric(10,2);

select pg_notify('pgrst', 'reload schema');
