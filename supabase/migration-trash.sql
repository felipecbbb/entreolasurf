-- Migration: Papelera (soft-delete con restaurar) para bonos y reservas
-- ============================================================
-- En vez de borrar definitivamente, "Eliminar" archiva una instantánea (la fila +
-- sus relacionadas: pagos, inscripciones) en deleted_items y luego borra. Restaurar
-- vuelve a insertar todo. Así hay deshacer + histórico sin filtrar cada consulta.
-- Solo staff con acceso. Ejecutar en el SQL Editor de Supabase.

create table if not exists public.deleted_items (
  id           uuid primary key default uuid_generate_v4(),
  entity_type  text not null,           -- 'bono' | 'booking'
  entity_id    uuid not null,
  label        text,                    -- texto para mostrar (cliente / título)
  snapshot     jsonb not null,          -- { row, payments[], enrollments[] }
  deleted_at   timestamptz not null default now(),
  deleted_by   uuid references auth.users(id),
  restored_at  timestamptz
);

create index if not exists idx_deleted_items_pending on public.deleted_items(restored_at, deleted_at desc);

alter table public.deleted_items enable row level security;
drop policy if exists "Staff manage trash" on public.deleted_items;
create policy "Staff manage trash" on public.deleted_items for all
  using (public.enc_can(array['clientes','reservas','calendario','material','reserva-clases','camps']))
  with check (public.enc_can(array['clientes','reservas','calendario','material','reserva-clases','camps']));
