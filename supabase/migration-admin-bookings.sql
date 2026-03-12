-- ============================================================
-- Migration: Support admin-created bookings (without bono)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. Make user_id nullable (for guest bookings from admin)
alter table public.class_enrollments alter column user_id drop not null;

-- 2. Make bono_id nullable (admin bookings bypass bono system)
alter table public.class_enrollments alter column bono_id drop not null;

-- 3. Add guest_name for walk-in / admin-created enrollments
alter table public.class_enrollments add column if not exists guest_name text;

-- 4. Expand status to include 'paid' (admin can mark as paid directly)
alter table public.class_enrollments drop constraint if exists class_enrollments_status_check;
alter table public.class_enrollments add constraint class_enrollments_status_check
  check (status in ('confirmed','cancelled','completed','no_show','paid'));

-- 5. Drop unique constraint that requires user_id (guests don't have one)
alter table public.class_enrollments drop constraint if exists class_enrollments_class_id_user_id_family_member_id_key;

-- 6. Add RLS policy for admin insert (existing policy only allows user's own)
-- Drop and recreate to avoid conflict
drop policy if exists "Admins insert enrollments" on public.class_enrollments;
create policy "Admins insert enrollments"
  on public.class_enrollments for insert
  with check (public.is_admin());

-- 7. Update enrolled_count trigger to also count 'paid' as active
create or replace function public.update_enrolled_count()
returns trigger as $$
begin
  if TG_OP = 'DELETE' then
    update public.surf_classes
    set enrolled_count = (
      select count(*) from public.class_enrollments
      where class_id = OLD.class_id and status in ('confirmed', 'paid')
    )
    where id = OLD.class_id;
    return OLD;
  else
    update public.surf_classes
    set enrolled_count = (
      select count(*) from public.class_enrollments
      where class_id = NEW.class_id and status in ('confirmed', 'paid')
    )
    where id = NEW.class_id;
    return NEW;
  end if;
end;
$$ language plpgsql security definer;

-- Done! The trigger on_enrollment_change already exists and will use the updated function.
-- IMPORTANT: After running this, execute: SELECT pg_notify('pgrst', 'reload schema');
select pg_notify('pgrst', 'reload schema');
