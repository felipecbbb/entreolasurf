-- Migration: Remove 'published' check from book_class function
-- This allows clients to book any class that exists in the system.
-- The admin can still use 'published' to control visibility if desired.
-- Run in Supabase SQL Editor

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
