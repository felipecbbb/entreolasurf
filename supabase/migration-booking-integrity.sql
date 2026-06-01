-- Migration: integridad de reservas (auditoría jun-2026, batch 2)
-- ============================================================
-- 1) cancel_enrollment ahora permite cancelar inscripciones pagadas
--    (paid/partial), no solo confirmed → el crédito vuelve al bono.
-- 2) enroll_from_webhook: inscripción ATÓMICA usada por el webhook de Stripe.
--    Bloquea la clase (FOR UPDATE) y revalida aforo dentro de la transacción
--    para evitar overbooking en pagos concurrentes. Solo service role.
-- Ejecutar en el SQL Editor de Supabase.

CREATE OR REPLACE FUNCTION public.cancel_enrollment(p_enrollment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
  if v_enrollment.status not in ('confirmed','paid','partial') then
    raise exception 'Esta inscripción no se puede cancelar';
  end if;

  select * into v_class from public.surf_classes where id = v_enrollment.class_id;
  if (v_class.date + v_class.time_start) < (now() + interval '2 hours') then
    raise exception 'No se puede cancelar con menos de 2 horas de antelación';
  end if;

  update public.class_enrollments
  set status = 'cancelled', updated_at = now()
  where id = p_enrollment_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enroll_from_webhook(
  p_class_id uuid, p_user_id uuid, p_family_member_id uuid, p_bono_id uuid
) RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_class record;
  v_active int;
begin
  select * into v_class from public.surf_classes where id = p_class_id for update;
  if v_class is null or v_class.published is not true or v_class.status <> 'scheduled' then
    return false;
  end if;

  select count(*) into v_active from public.class_enrollments
    where class_id = p_class_id and status <> 'cancelled';
  if v_active >= v_class.max_students then
    return false;
  end if;

  insert into public.class_enrollments (class_id, user_id, family_member_id, bono_id, status)
  values (p_class_id, p_user_id, p_family_member_id, p_bono_id, 'confirmed')
  on conflict do nothing;
  return true;
exception when others then
  return false;
end;
$function$;

REVOKE ALL ON FUNCTION public.enroll_from_webhook(uuid,uuid,uuid,uuid) FROM public, anon, authenticated;
