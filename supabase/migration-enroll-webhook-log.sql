-- Migration: enroll_from_webhook deja de fallar EN SILENCIO
-- ============================================================
-- Antes, al pagar una clase por web, si la inscripción no se podía crear (clase llena,
-- no publicada, o CUALQUIER error) la función devolvía false sin dejar rastro: el bono y
-- el pago se creaban, pero la clase NO aparecía "en playa" y nadie sabía por qué.
-- Esta versión mantiene el mismo comportamiento seguro, pero registra en los logs de la
-- función el MOTIVO (clase llena / no válida / error), para poder reconciliar reservas.
-- Ejecutar en el SQL Editor de Supabase.

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
    raise warning 'enroll_from_webhook: clase % no válida (null/no publicada/no scheduled)', p_class_id;
    return false;
  end if;

  select count(*) into v_active from public.class_enrollments
    where class_id = p_class_id and status <> 'cancelled';
  if v_active >= v_class.max_students then
    raise warning 'enroll_from_webhook: clase % LLENA (%/%) — user %, no se inscribe', p_class_id, v_active, v_class.max_students, p_user_id;
    return false;
  end if;

  insert into public.class_enrollments (class_id, user_id, family_member_id, bono_id, status)
  values (p_class_id, p_user_id, p_family_member_id, p_bono_id, 'confirmed')
  on conflict do nothing;
  return true;
exception when others then
  raise warning 'enroll_from_webhook ERROR (clase %, user %, bono %): %', p_class_id, p_user_id, p_bono_id, sqlerrm;
  return false;
end;
$function$;

REVOKE ALL ON FUNCTION public.enroll_from_webhook(uuid,uuid,uuid,uuid) FROM public, anon, authenticated;
