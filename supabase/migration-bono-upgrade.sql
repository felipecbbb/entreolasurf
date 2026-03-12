-- Migration: Allow clients to upgrade their own bonos
-- Adds RPC function that validates and upgrades a bono safely
-- Run in Supabase SQL Editor

-- RPC: upgrade_bono(p_bono_id, p_new_total_credits)
-- Validates: user owns bono, bono is active, new total > current total, new total > used credits
create or replace function public.upgrade_bono(
  p_bono_id uuid,
  p_new_total_credits int
) returns void as $$
declare
  v_bono record;
begin
  -- Lock and fetch the bono
  select * into v_bono
  from public.bonos
  where id = p_bono_id
  for update;

  if not found then
    raise exception 'Bono no encontrado';
  end if;

  -- Validate ownership
  if v_bono.user_id != auth.uid() then
    raise exception 'No tienes permiso para modificar este bono';
  end if;

  -- Validate bono is active
  if v_bono.status != 'active' then
    raise exception 'Solo se pueden ampliar bonos activos';
  end if;

  -- Validate new total is larger
  if p_new_total_credits <= v_bono.total_credits then
    raise exception 'El nuevo número de sesiones debe ser mayor al actual (%)' , v_bono.total_credits;
  end if;

  -- Validate new total is at least used_credits
  if p_new_total_credits <= v_bono.used_credits then
    raise exception 'El nuevo total no puede ser menor que las sesiones ya usadas (%)' , v_bono.used_credits;
  end if;

  -- Perform the upgrade
  update public.bonos
  set total_credits = p_new_total_credits,
      updated_at = now()
  where id = p_bono_id;

end;
$$ language plpgsql security definer;
