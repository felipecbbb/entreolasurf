-- ============================================================
-- Migration: Rental Equipment Catalog + Reservations
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. RENTAL EQUIPMENT (catálogo de material para alquilar)
-- ============================================================
create table if not exists public.rental_equipment (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  slug        text not null unique,
  type        text not null default 'basico' check (type in ('basico','con_talla')),
  description text,
  image_url   text,
  pricing     jsonb not null default '{}',
  deposit     numeric(8,2) not null default 5,
  stock       int not null default 1 check (stock >= 0),
  sizes       jsonb default '[]'::jsonb,
  tags        text[] default '{}',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.rental_equipment is 'Catálogo de material disponible para alquiler';

-- 2. EQUIPMENT RESERVATIONS (reservas de material por fecha)
-- ============================================================
create table if not exists public.equipment_reservations (
  id              uuid primary key default uuid_generate_v4(),
  equipment_id    uuid not null references public.rental_equipment(id) on delete cascade,
  user_id         uuid references public.profiles(id) on delete set null,
  guest_name      text,
  guest_email     text,
  guest_phone     text,
  date_start      date not null,
  date_end        date not null,
  duration_key    text not null,
  size            text,
  quantity        int not null default 1 check (quantity > 0),
  status          text not null default 'pending'
                    check (status in ('pending','confirmed','active','returned','cancelled')),
  total_amount    numeric(8,2) not null default 0,
  deposit_paid    numeric(8,2) not null default 0,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.equipment_reservations is 'Reservas de alquiler de material';

-- 3. RLS
-- ============================================================
alter table public.rental_equipment enable row level security;
alter table public.equipment_reservations enable row level security;

create policy "Anyone can read equipment"
  on public.rental_equipment for select using (true);
create policy "Admins manage equipment"
  on public.rental_equipment for all using (public.is_admin());

create policy "Users read own equipment reservations"
  on public.equipment_reservations for select
  using (user_id = auth.uid() or public.is_admin());
create policy "Anyone can create equipment reservations"
  on public.equipment_reservations for insert
  with check (user_id = auth.uid() or guest_email is not null);
create policy "Admins manage all equipment reservations"
  on public.equipment_reservations for all using (public.is_admin());

-- 4. INDEXES
-- ============================================================
create index if not exists idx_rental_equipment_active on public.rental_equipment(active);
create index if not exists idx_rental_equipment_slug on public.rental_equipment(slug);
create index if not exists idx_equip_reservations_equipment on public.equipment_reservations(equipment_id);
create index if not exists idx_equip_reservations_dates on public.equipment_reservations(date_start, date_end);
create index if not exists idx_equip_reservations_user on public.equipment_reservations(user_id);
create index if not exists idx_equip_reservations_status on public.equipment_reservations(status);

-- 5. SEED: Los 6 materiales del frontend con precios reales
-- pricing keys: 1h, 2h, 1d, 1w (valores en EUR)
-- ============================================================
insert into public.rental_equipment (name, slug, type, description, pricing, deposit, stock, sizes, tags) values
  ('Tabla Soft Board',
   'tabla-soft-board',
   'con_talla',
   'Tabla softboard ideal para principiantes e intermedios. Todas las medidas disponibles de 5''8 a 8''4.',
   '{"1h": 15, "2h": 20, "1d": 45, "1w": 125}'::jsonb,
   5, 1,
   '["5''8", "6''0", "6''6", "7''0", "7''6", "8''0", "8''4"]'::jsonb,
   '{"surf", "tabla", "softboard", "principiante"}'),

  ('Tabla Dura',
   'tabla-dura',
   'con_talla',
   'Tabla dura para surfistas intermedios y avanzados. Todas las medidas de 5''8 a 8''4.',
   '{"1h": 20, "2h": 25, "1d": 50, "1w": 135}'::jsonb,
   5, 1,
   '["5''8", "6''0", "6''2", "6''6", "7''0", "7''6", "8''0", "8''4"]'::jsonb,
   '{"surf", "tabla", "dura", "intermedio", "avanzado"}'),

  ('Neopreno',
   'neopreno',
   'con_talla',
   'Traje de neopreno 3/2mm. Disponible en todas las tallas a partir de 6 años.',
   '{"1h": 5, "2h": 10, "1d": 20, "1w": 80}'::jsonb,
   5, 1,
   '["6 años", "8 años", "10 años", "12 años", "XS", "S", "M", "L", "XL"]'::jsonb,
   '{"neopreno", "traje"}'),

  ('Paddle Surf',
   'paddle-surf',
   'basico',
   'Tabla SUP hinchable con remo incluido. Para todos los niveles.',
   '{"1h": 16, "2h": 28, "1d": 39, "1w": 125}'::jsonb,
   5, 1,
   '[]'::jsonb,
   '{"paddle", "sup", "remo"}'),

  ('Body Board',
   'body-board',
   'basico',
   'Bodyboard con leash incluido. Diversión en orilla y rompiente para todos los niveles.',
   '{"1h": 10, "2h": 15, "1d": 25, "1w": 85}'::jsonb,
   5, 1,
   '[]'::jsonb,
   '{"bodyboard"}'),

  ('Skate',
   'skate',
   'con_talla',
   'Surfskate con casco incluido. Entrenamiento fuera del agua.',
   '{"1h": 10, "2h": 16, "1d": 25, "1w": 135}'::jsonb,
   5, 1,
   '["S (28'')", "M (31'')", "L (33'')"]'::jsonb,
   '{"surfskate", "skate", "casco"}');
