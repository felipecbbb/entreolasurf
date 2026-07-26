-- Migration: Control Horario — marcar la semana como PAGADA por monitor
-- ============================================================
-- Añade una fila "PAGADO" a la rejilla semanal: por cada monitor y semana se
-- guarda si ya se le ha pagado, cuándo y por cuánto (snapshot del importe en el
-- momento del pago, para que un cambio posterior de tarifas no reescriba el
-- histórico). Corrige además la tarifa de DÍA CORTO: 63 → 62 (valor real del
-- Excel de Nico).
-- Ejecutar en el SQL Editor de Supabase.

-- 1. Pagos por monitor y semana (una fila = una semana pagada)
create table if not exists public.monitor_payments (
  id          uuid primary key default gen_random_uuid(),
  monitor_id  uuid not null references public.monitors(id) on delete cascade,
  week_start  date not null,                      -- lunes de la semana pagada
  amount      numeric(10,2) not null default 0,   -- importe pagado (snapshot)
  paid_at     timestamptz not null default now(),
  paid_by     uuid references auth.users(id) on delete set null,
  note        text,
  unique (monitor_id, week_start)
);
alter table public.monitor_payments enable row level security;
drop policy if exists "Staff manage monitor payments" on public.monitor_payments;
create policy "Staff manage monitor payments" on public.monitor_payments for all
  using (public.enc_can(array['control-horario']))
  with check (public.enc_can(array['control-horario']));
create index if not exists idx_monitor_payments_week on public.monitor_payments(week_start);

-- 2. Fix tarifa DÍA CORTO: el Excel usa 62 €, no 63 €
--    (=CONTAR.SI(...;"DIA LARGO")*70 + CONTAR.SI(...;"DIA CORTO")*62 + CONTAR.SI(...;"TRABAJA")*36)
update public.payroll_config set dia_corto = 62, updated_at = now() where id = 1;

select pg_notify('pgrst', 'reload schema');
