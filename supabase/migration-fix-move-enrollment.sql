-- Migration: Fix enrolled_count when moving enrollments between classes
-- The trigger was only updating NEW.class_id on UPDATE, not decrementing OLD.class_id
-- Run in Supabase SQL Editor

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

  elsif TG_OP = 'UPDATE' then
    -- Always update the NEW class
    update public.surf_classes
    set enrolled_count = (
      select count(*) from public.class_enrollments
      where class_id = NEW.class_id and status in ('confirmed', 'paid')
    )
    where id = NEW.class_id;

    -- If class_id changed (move), also update the OLD class
    if OLD.class_id != NEW.class_id then
      update public.surf_classes
      set enrolled_count = (
        select count(*) from public.class_enrollments
        where class_id = OLD.class_id and status in ('confirmed', 'paid')
      )
      where id = OLD.class_id;
    end if;
    return NEW;

  else -- INSERT
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
