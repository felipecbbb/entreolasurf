-- ============================================================
-- Migration: Payments tracking table
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. Create payments table
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  reservation_type text not null check (reservation_type in ('enrollment', 'rental')),
  reference_id uuid not null,
  amount numeric(10,2) not null default 0,
  payment_method text not null default 'efectivo' check (payment_method in ('efectivo', 'tarjeta', 'transferencia', 'voucher', 'saldo', 'online')),
  concept text,
  payment_date timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- 2. Enable RLS
alter table public.payments enable row level security;

-- 3. Admin-only policy
create policy "Admins manage payments"
  on public.payments for all
  using (public.is_admin())
  with check (public.is_admin());

-- 4. Update constraint if table already existed with old values
do $$
begin
  alter table public.payments drop constraint if exists payments_payment_method_check;
  alter table public.payments add constraint payments_payment_method_check
    check (payment_method in ('efectivo', 'tarjeta', 'transferencia', 'voucher', 'saldo', 'online'));
exception when others then null;
end $$;

-- 5. Index for quick lookups
create index if not exists idx_payments_reference on public.payments(reservation_type, reference_id);

-- Done!
select pg_notify('pgrst', 'reload schema');
