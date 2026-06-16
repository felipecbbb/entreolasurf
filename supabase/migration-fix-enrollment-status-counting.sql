-- ============================================================
-- Migración: contar créditos y aforo por inscripción NO CANCELADA
-- ============================================================
-- Problema (auditoría jun-2026): el calendario crea/actualiza las inscripciones
-- de bono con status 'paid'/'partial' (no 'confirmed'), pero:
--   * update_bono_credits contaba SOLO status='confirmed' → used_credits queda
--     corto y se "resetea" a 0 al pagar (clases gratis, bono nunca 'exhausted').
--   * update_enrolled_count contaba ('confirmed','paid') pero NO 'partial' →
--     clases con inscritos a medias parecen vacías → overbooking (también web).
-- Solución: ambos contadores cuentan TODA inscripción no cancelada (status <> 'cancelled').
-- Incluye recálculo de los datos ya corruptos.
-- Ejecutar en Supabase (SQL Editor o apply_migration).
-- ============================================================

-- 1) used_credits / status del bono: contar inscripciones no canceladas
create or replace function public.update_bono_credits()
returns trigger as $$
declare
  v_used int;
begin
  if TG_OP = 'DELETE' then
    select count(*) into v_used from public.class_enrollments
    where bono_id = OLD.bono_id and status <> 'cancelled';
    update public.bonos
    set used_credits = v_used,
        status = case
          when status in ('cancelled','expired') then status
          when v_used >= total_credits then 'exhausted'
          else 'active'
        end,
        updated_at = now()
    where id = OLD.bono_id;
    return OLD;
  else
    select count(*) into v_used from public.class_enrollments
    where bono_id = NEW.bono_id and status <> 'cancelled';
    update public.bonos
    set used_credits = v_used,
        status = case
          when status in ('cancelled','expired') then status
          when v_used >= total_credits then 'exhausted'
          else 'active'
        end,
        updated_at = now()
    where id = NEW.bono_id;
    return NEW;
  end if;
end;
$$ language plpgsql security definer;

-- 2) enrolled_count de la clase: contar inscripciones no canceladas
create or replace function public.update_enrolled_count()
returns trigger as $$
begin
  if TG_OP = 'DELETE' then
    update public.surf_classes
    set enrolled_count = (
      select count(*) from public.class_enrollments
      where class_id = OLD.class_id and status <> 'cancelled'
    )
    where id = OLD.class_id;
    return OLD;

  elsif TG_OP = 'UPDATE' then
    update public.surf_classes
    set enrolled_count = (
      select count(*) from public.class_enrollments
      where class_id = NEW.class_id and status <> 'cancelled'
    )
    where id = NEW.class_id;

    if OLD.class_id is distinct from NEW.class_id then
      update public.surf_classes
      set enrolled_count = (
        select count(*) from public.class_enrollments
        where class_id = OLD.class_id and status <> 'cancelled'
      )
      where id = OLD.class_id;
    end if;
    return NEW;

  else -- INSERT
    update public.surf_classes
    set enrolled_count = (
      select count(*) from public.class_enrollments
      where class_id = NEW.class_id and status <> 'cancelled'
    )
    where id = NEW.class_id;
    return NEW;
  end if;
end;
$$ language plpgsql security definer;

-- ============================================================
-- 3) REPARACIÓN de datos ya corruptos
-- ============================================================

-- 3a) Recalcular used_credits y status de TODOS los bonos
update public.bonos b set
  used_credits = c.cnt,
  status = case
    when b.status in ('cancelled','expired') then b.status
    when c.cnt >= b.total_credits then 'exhausted'
    else 'active'
  end,
  updated_at = now()
from (
  select b2.id,
         (select count(*) from public.class_enrollments e
          where e.bono_id = b2.id and e.status <> 'cancelled') as cnt
  from public.bonos b2
) c
where b.id = c.id;

-- 3b) Recalcular enrolled_count de TODAS las clases
update public.surf_classes sc set
  enrolled_count = (
    select count(*) from public.class_enrollments e
    where e.class_id = sc.id and e.status <> 'cancelled'
  );
