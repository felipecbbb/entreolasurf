-- ============================================================
-- Avisos automáticos de bono (función bono-reminders)
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

-- 1) Histórico de avisos enviados (anti-duplicados)
create table if not exists public.bono_reminders (
  id        uuid primary key default gen_random_uuid(),
  bono_id   uuid not null references public.bonos(id) on delete cascade,
  kind      text not null check (kind in ('expira_30','expira_7','pendiente')),
  ref_date  date,                     -- caducidad del bono para expira_*; null en pendiente
  email     text,
  sent_at   timestamptz not null default now()
);
create index if not exists bono_reminders_bono_idx on public.bono_reminders (bono_id);
-- Un aviso de caducidad por bono y fecha de caducidad (si se amplía, vuelve a avisar)
create unique index if not exists bono_reminders_expira_uniq
  on public.bono_reminders (bono_id, kind, ref_date) where kind <> 'pendiente';

alter table public.bono_reminders enable row level security;
drop policy if exists "Admins read bono_reminders" on public.bono_reminders;
create policy "Admins read bono_reminders"
  on public.bono_reminders for select using (public.is_admin());
-- Solo escribe la función (service role, se salta RLS).

-- 2) Programación diaria: 10:00 hora peninsular
--    (pg_cron va en UTC: 9:00 UTC = 10:00 en invierno, 11:00 en verano).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Secreto compartido con la función (mismo valor que CRON_SECRET en sus secrets).
-- Sustituir <CRON_SECRET> antes de ejecutar.
select vault.create_secret('<CRON_SECRET>', 'bono_reminders_cron_secret')
where not exists (select 1 from vault.secrets where name = 'bono_reminders_cron_secret');

select cron.unschedule('bono-reminders-diario')
where exists (select 1 from cron.job where jobname = 'bono-reminders-diario');

select cron.schedule(
  'bono-reminders-diario',
  '0 9 * * *',
  $$
  select net.http_post(
    url     := 'https://vqandetiodxrpdipvrkh.supabase.co/functions/v1/bono-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets
                        where name = 'bono_reminders_cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
