-- Migration: RPC to safely delete a user (admin only, no self-delete)
-- Deletes from auth.users which cascades to profiles and all related data
-- Run in Supabase SQL Editor

CREATE OR REPLACE FUNCTION delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Prevent self-deletion
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'No puedes eliminarte a ti mismo';
  END IF;

  -- Verify caller is admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administradores pueden eliminar usuarios';
  END IF;

  -- Delete from auth.users (cascades to profiles and all related tables)
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_user(uuid) TO authenticated;
