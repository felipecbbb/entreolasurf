-- Migration: Control Horario — envío de horarios por WhatsApp
-- ============================================================
-- Pestaña nueva dentro de Control Horario: se elige un rango de fechas, se
-- asigna a cada empleado su franja horaria en cada día del rango, y el panel
-- compone el mensaje y abre WhatsApp para elegir el grupo. Cada envío queda
-- registrado y consultable.
--
-- Acceso RESTRINGIDO: no basta con tener la sección 'control-horario'. Solo el
-- admin y las cuentas marcadas con profiles.can_send_schedules (hoy, Nico).
-- Ejecutar en el SQL Editor de Supabase.

-- 1. Permiso explícito por cuenta (se marca desde la sección Equipo)
alter table public.profiles add column if not exists can_send_schedules boolean not null default false;

-- Quien puede enviar horarios: admin, o encargado con el permiso marcado.
create or replace function public.can_send_schedules()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'admin' or (p.role = 'encargado' and p.can_send_schedules))
  );
$$;

-- El trigger anti-escalada ya protege role/allowed_sections; can_send_schedules
-- es igual de sensible, así que solo un admin estricto puede cambiarlo.
create or replace function public.protect_send_schedules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.can_send_schedules is distinct from old.can_send_schedules
     and not public.is_strict_admin() then
    raise exception 'Solo un admin puede cambiar el permiso de envío de horarios';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_protect_send_schedules on public.profiles;
create trigger trg_protect_send_schedules before update on public.profiles
  for each row execute function public.protect_send_schedules();

-- 2. Franjas horarias configurables ("09:00 - 14:00", "Mañana carpa", "Libre"…)
create table if not exists public.work_shift_templates (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  sort_order  int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.work_shift_templates enable row level security;
drop policy if exists "Staff read shift templates" on public.work_shift_templates;
create policy "Staff read shift templates" on public.work_shift_templates for select
  using (public.enc_can(array['control-horario']));
drop policy if exists "Senders manage shift templates" on public.work_shift_templates;
create policy "Senders manage shift templates" on public.work_shift_templates for all
  using (public.can_send_schedules()) with check (public.can_send_schedules());

insert into public.work_shift_templates (label, sort_order)
select * from (values
  ('09:00 - 14:00', 0), ('10:00 - 14:00', 1), ('16:00 - 20:00', 2),
  ('09:00 - 18:00', 3), ('Mañana carpa', 4), ('Tarde carpa', 5), ('Libre', 6)
) as v(label, sort_order)
where not exists (select 1 from public.work_shift_templates);

-- 3. Registro de envíos (cabecera + detalle por empleado y día)
create table if not exists public.schedule_sends (
  id          uuid primary key default gen_random_uuid(),
  date_from   date not null,
  date_to     date not null,
  message     text not null,
  sent_at     timestamptz not null default now(),
  sent_by     uuid references public.profiles(id) on delete set null
);
alter table public.schedule_sends enable row level security;
drop policy if exists "Senders manage schedule sends" on public.schedule_sends;
create policy "Senders manage schedule sends" on public.schedule_sends for all
  using (public.can_send_schedules()) with check (public.can_send_schedules());
create index if not exists idx_schedule_sends_at on public.schedule_sends(sent_at desc);

create table if not exists public.schedule_send_items (
  id          uuid primary key default gen_random_uuid(),
  send_id     uuid not null references public.schedule_sends(id) on delete cascade,
  monitor_id  uuid references public.monitors(id) on delete set null,
  monitor_name text not null,          -- copia: el registro debe sobrevivir al borrado del monitor
  work_date   date not null,
  shift_label text not null
);
alter table public.schedule_send_items enable row level security;
drop policy if exists "Senders manage schedule send items" on public.schedule_send_items;
create policy "Senders manage schedule send items" on public.schedule_send_items for all
  using (public.can_send_schedules()) with check (public.can_send_schedules());
create index if not exists idx_schedule_items_send on public.schedule_send_items(send_id);

select pg_notify('pgrst', 'reload schema');
