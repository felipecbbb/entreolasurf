-- ============================================================
-- Migration: Sistema de Reservas con Bonos, Familia y Calendario
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. FAMILY MEMBERS — Sub-perfiles familiares
-- ============================================================
create table public.family_members (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  full_name   text not null,
  birth_date  date,
  level       text check (level in ('principiante','intermedio','avanzado')),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.family_members is 'Sub-perfiles familiares gestionados por el usuario principal';

-- RLS
alter table public.family_members enable row level security;

create policy "Users manage own family members"
  on public.family_members for all
  using (user_id = auth.uid());

create policy "Admins read all family members"
  on public.family_members for select
  using (public.is_admin());

create index idx_family_members_user on public.family_members(user_id);

-- 2. MODIFICAR SURF_CLASSES — Añadir campos y expandir tipos
-- ============================================================

-- Quitar constraint de tipo antiguo y añadir nuevos tipos
alter table public.surf_classes drop constraint if exists surf_classes_type_check;
alter table public.surf_classes add constraint surf_classes_type_check
  check (type in ('grupal','individual','yoga','paddle','surfskate'));

-- Nuevos campos
alter table public.surf_classes add column if not exists level text default 'todos'
  check (level in ('principiante','intermedio','avanzado','todos'));
alter table public.surf_classes add column if not exists published boolean not null default false;
alter table public.surf_classes add column if not exists enrolled_count int not null default 0;

-- 3. BONOS — Packs de créditos comprados
-- ============================================================
create table public.bonos (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  order_id        uuid references public.orders(id) on delete set null,
  class_type      text not null check (class_type in ('grupal','individual','yoga','paddle','surfskate')),
  total_credits   int not null check (total_credits > 0),
  used_credits    int not null default 0 check (used_credits >= 0),
  status          text not null default 'active'
                    check (status in ('active','expired','exhausted','cancelled')),
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.bonos is 'Packs de créditos de clases comprados por los usuarios';

-- RLS
alter table public.bonos enable row level security;

create policy "Users read own bonos"
  on public.bonos for select
  using (user_id = auth.uid() or public.is_admin());

create policy "Users cannot directly insert bonos"
  on public.bonos for insert
  with check (user_id = auth.uid());

create policy "Admins manage all bonos"
  on public.bonos for all
  using (public.is_admin());

create index idx_bonos_user on public.bonos(user_id);
create index idx_bonos_status on public.bonos(status);

-- 4. CLASS ENROLLMENTS — Inscripciones a clases concretas
-- ============================================================
create table public.class_enrollments (
  id                uuid primary key default uuid_generate_v4(),
  class_id          uuid not null references public.surf_classes(id) on delete cascade,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  family_member_id  uuid references public.family_members(id) on delete set null,
  bono_id           uuid not null references public.bonos(id) on delete cascade,
  status            text not null default 'confirmed'
                      check (status in ('confirmed','cancelled','completed','no_show')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique(class_id, user_id, family_member_id)
);

comment on table public.class_enrollments is 'Inscripciones de usuarios/familiares a clases programadas';

-- RLS
alter table public.class_enrollments enable row level security;

create policy "Users read own enrollments"
  on public.class_enrollments for select
  using (user_id = auth.uid() or public.is_admin());

create policy "Admins manage all enrollments"
  on public.class_enrollments for all
  using (public.is_admin());

create index idx_enrollments_class on public.class_enrollments(class_id);
create index idx_enrollments_user on public.class_enrollments(user_id);
create index idx_enrollments_bono on public.class_enrollments(bono_id);

-- 5. TRIGGER: Actualizar enrolled_count en surf_classes
-- ============================================================
create or replace function public.update_enrolled_count()
returns trigger as $$
begin
  if TG_OP = 'DELETE' then
    update public.surf_classes
    set enrolled_count = (
      select count(*) from public.class_enrollments
      where class_id = OLD.class_id and status = 'confirmed'
    )
    where id = OLD.class_id;
    return OLD;
  else
    update public.surf_classes
    set enrolled_count = (
      select count(*) from public.class_enrollments
      where class_id = NEW.class_id and status = 'confirmed'
    )
    where id = NEW.class_id;
    return NEW;
  end if;
end;
$$ language plpgsql security definer;

create trigger on_enrollment_change
  after insert or update or delete on public.class_enrollments
  for each row execute function public.update_enrolled_count();

-- 6. TRIGGER: Actualizar used_credits y status en bonos
-- ============================================================
create or replace function public.update_bono_credits()
returns trigger as $$
declare
  v_used int;
begin
  if TG_OP = 'DELETE' then
    select count(*) into v_used from public.class_enrollments
    where bono_id = OLD.bono_id and status = 'confirmed';
    update public.bonos
    set used_credits = v_used,
        status = case
          when v_used >= total_credits then 'exhausted'
          else 'active'
        end,
        updated_at = now()
    where id = OLD.bono_id;
    return OLD;
  else
    select count(*) into v_used from public.class_enrollments
    where bono_id = NEW.bono_id and status = 'confirmed';
    update public.bonos
    set used_credits = v_used,
        status = case
          when v_used >= total_credits then 'exhausted'
          else 'active'
        end,
        updated_at = now()
    where id = NEW.bono_id;
    return NEW;
  end if;
end;
$$ language plpgsql security definer;

create trigger on_enrollment_bono_change
  after insert or update or delete on public.class_enrollments
  for each row execute function public.update_bono_credits();

-- 7. FUNCIÓN ATÓMICA: book_class
-- ============================================================
create or replace function public.book_class(
  p_class_id uuid,
  p_bono_id uuid,
  p_family_member_id uuid default null
)
returns uuid as $$
declare
  v_bono record;
  v_class record;
  v_member record;
  v_user_id uuid;
  v_enrollment_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  -- Lock bono
  select * into v_bono from public.bonos
  where id = p_bono_id for update;

  if v_bono is null then
    raise exception 'Bono no encontrado';
  end if;
  if v_bono.user_id != v_user_id then
    raise exception 'Este bono no te pertenece';
  end if;
  if v_bono.status != 'active' then
    raise exception 'Bono no activo (estado: %)', v_bono.status;
  end if;
  if v_bono.expires_at < now() then
    raise exception 'Bono expirado';
  end if;
  if v_bono.used_credits >= v_bono.total_credits then
    raise exception 'Sin créditos disponibles en este bono';
  end if;

  -- Lock class
  select * into v_class from public.surf_classes
  where id = p_class_id for update;

  if v_class is null then
    raise exception 'Clase no encontrada';
  end if;
  if not v_class.published then
    raise exception 'Clase no publicada';
  end if;
  if v_class.enrolled_count >= v_class.max_students then
    raise exception 'Clase completa';
  end if;
  if v_class.type != v_bono.class_type then
    raise exception 'El tipo de bono (%) no coincide con la clase (%)', v_bono.class_type, v_class.type;
  end if;
  if (v_class.date + v_class.time_start) < now() then
    raise exception 'Esta clase ya ha pasado';
  end if;

  -- Verificar miembro familiar
  if p_family_member_id is not null then
    select * into v_member from public.family_members
    where id = p_family_member_id and user_id = v_user_id;

    if v_member is null then
      raise exception 'Miembro familiar no encontrado o no te pertenece';
    end if;
  end if;

  -- Crear enrollment
  insert into public.class_enrollments (class_id, user_id, family_member_id, bono_id, status)
  values (p_class_id, v_user_id, p_family_member_id, p_bono_id, 'confirmed')
  returning id into v_enrollment_id;

  return v_enrollment_id;
end;
$$ language plpgsql security definer;

-- 8. FUNCIÓN ATÓMICA: cancel_enrollment
-- ============================================================
create or replace function public.cancel_enrollment(
  p_enrollment_id uuid
)
returns void as $$
declare
  v_enrollment record;
  v_class record;
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  select * into v_enrollment from public.class_enrollments
  where id = p_enrollment_id for update;

  if v_enrollment is null then
    raise exception 'Inscripción no encontrada';
  end if;
  if v_enrollment.user_id != v_user_id then
    raise exception 'Esta inscripción no te pertenece';
  end if;
  if v_enrollment.status != 'confirmed' then
    raise exception 'Solo se pueden cancelar inscripciones confirmadas';
  end if;

  -- Verificar que la clase es futura (>2h antes)
  select * into v_class from public.surf_classes where id = v_enrollment.class_id;
  if (v_class.date + v_class.time_start) < (now() + interval '2 hours') then
    raise exception 'No se puede cancelar con menos de 2 horas de antelación';
  end if;

  -- Cancelar
  update public.class_enrollments
  set status = 'cancelled', updated_at = now()
  where id = p_enrollment_id;
end;
$$ language plpgsql security definer;
