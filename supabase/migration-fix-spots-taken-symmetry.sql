-- ============================================================
-- Migración: spots_taken de surf_camps simétrico y completo
-- ============================================================
-- Problema (auditoría jun-2026): update_spots_on_booking solo cubría
--   pending → deposit_paid (incrementa) y *→cancelled (decrementa).
-- No cubría: pending→fully_paid (no sube), →refunded (no baja),
--   deposit_paid→pending (no baja) ni DELETE de la reserva (no baja).
-- Resultado: plazas fantasma o plazas pagadas sin contar; camps que no
--   vuelven de 'full' a 'open'.
-- Solución: contar como "ocupante" cualquier reserva en ('deposit_paid','fully_paid')
--   e incrementar/decrementar según se entre o salga de ese conjunto, incluido DELETE.
-- Incluye recálculo de spots_taken ya descuadrado.
-- ============================================================

create or replace function public.update_spots_on_booking()
returns trigger as $$
declare
  v_old_occ boolean := (TG_OP <> 'INSERT') and (OLD.status in ('deposit_paid','fully_paid'));
  v_new_occ boolean := (TG_OP <> 'DELETE') and (NEW.status in ('deposit_paid','fully_paid'));
  v_camp uuid := case when TG_OP = 'DELETE' then OLD.camp_id else NEW.camp_id end;
begin
  if v_camp is null then
    return case when TG_OP = 'DELETE' then OLD else NEW end;
  end if;

  if v_new_occ and not v_old_occ then
    update public.surf_camps
    set spots_taken = spots_taken + 1,
        status = case when status <> 'closed' and spots_taken + 1 >= max_spots then 'full' else status end
    where id = v_camp;
  elsif v_old_occ and not v_new_occ then
    update public.surf_camps
    set spots_taken = greatest(spots_taken - 1, 0),
        status = case when status = 'full' and greatest(spots_taken - 1, 0) < max_spots then 'open' else status end
    where id = v_camp;
  end if;

  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$ language plpgsql security definer;

-- Recrear el trigger para que cubra INSERT, UPDATE y DELETE
drop trigger if exists on_booking_status_change on public.bookings;
create trigger on_booking_status_change
  after insert or update or delete on public.bookings
  for each row execute function public.update_spots_on_booking();

-- ============================================================
-- REPARACIÓN: recalcular spots_taken y status de cada camp
-- ============================================================
update public.surf_camps sc set
  spots_taken = c.n,
  status = case
    when sc.status = 'closed' then 'closed'
    when c.n >= sc.max_spots then 'full'
    when sc.status = 'full' and c.n < sc.max_spots then 'open'
    else sc.status
  end
from (
  select s.id,
         (select count(*) from public.bookings b
          where b.camp_id = s.id and b.status in ('deposit_paid','fully_paid')) as n
  from public.surf_camps s
) c
where sc.id = c.id;
