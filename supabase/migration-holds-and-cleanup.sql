-- Migration: holds y limpieza de pedidos (auditoría jun-2026, batch 5)
-- ============================================================
-- 1) create_hold ya NO reextiende todos los holds del token en cada llamada
--    (evitaba que un usuario bloquease inventario indefinidamente). Cada hold
--    caduca por sí mismo a los 10 min.
-- 2) Cron que cancela pedidos 'pending' abandonados de más de 48h (la sesión
--    de Stripe caduca a las 24h, así que no se cancela ningún pago vivo).
-- Ejecutar en el SQL Editor de Supabase.

CREATE OR REPLACE FUNCTION public.create_hold(p_class_id uuid, p_cart_token text, p_qty integer DEFAULT 1)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_class   public.surf_classes%rowtype;
  v_active  int;
  v_left    int;
  v_until   timestamptz := now() + interval '10 minutes';
begin
  if p_cart_token is null or length(p_cart_token) < 8 then
    raise exception 'Token de carrito invalido';
  end if;
  if p_qty < 1 then
    raise exception 'Cantidad invalida';
  end if;

  select * into v_class from public.surf_classes where id = p_class_id for update;
  if not found then raise exception 'Clase no encontrada'; end if;
  if v_class.published is not true or v_class.status <> 'scheduled' then
    raise exception 'Clase no disponible';
  end if;

  select count(*) into v_active from public.class_holds
  where class_id = p_class_id and held_until > now();

  v_left := v_class.max_students - v_class.enrolled_count - v_active;
  if v_left < p_qty then
    raise exception 'No quedan plazas suficientes (disponibles: %)', greatest(v_left, 0);
  end if;

  insert into public.class_holds (class_id, cart_token, held_until)
  select p_class_id, p_cart_token, v_until from generate_series(1, p_qty);

  return v_until;
end;
$function$;

-- Cancela pedidos pending abandonados (>48h). Requiere pg_cron (ya activo).
SELECT cron.schedule(
  'cancel-stale-pending-orders',
  '17 * * * *',
  $$ update public.orders set status='cancelled', updated_at=now()
     where status='pending' and created_at < now() - interval '48 hours' $$
);
