-- ============================================================
-- Entre Olas Surf — Supabase Schema
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 0. Extensiones
-- ============================================================
create extension if not exists "uuid-ossp";

-- 1. PROFILES (extiende auth.users)
-- ============================================================
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  phone       text,
  role        text not null default 'client' check (role in ('admin','client')),
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is 'Datos extra de cada usuario (admin o cliente)';

-- Trigger: crear perfil automáticamente al registrarse
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', '')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. SURF CAMPS (ediciones)
-- ============================================================
create table public.surf_camps (
  id              uuid primary key default uuid_generate_v4(),
  title           text not null,
  slug            text not null unique,
  kicker          text,
  date_start      date not null,
  date_end        date not null,
  duration_days   int generated always as (date_end - date_start + 1) stored,
  price           numeric(8,2) not null,
  original_price  numeric(8,2),
  deposit         numeric(8,2) not null default 180,
  max_spots       int not null default 17,
  spots_taken     int not null default 0,
  status          text not null default 'open' check (status in ('open','full','closed','coming_soon')),
  hero_image      text,
  description     text,
  cart_id         int,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.surf_camps is 'Cada edición de Surf Camp';

-- 3. BOOKINGS (reservas de camp)
-- ============================================================
create table public.bookings (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  camp_id         uuid not null references public.surf_camps(id) on delete cascade,
  status          text not null default 'pending'
                    check (status in ('pending','deposit_paid','fully_paid','cancelled','refunded')),
  deposit_amount  numeric(8,2),
  total_amount    numeric(8,2) not null,
  payment_method  text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.bookings is 'Reservas de Surf Camp';

-- Trigger: incrementar spots_taken al confirmar depósito
create or replace function public.update_spots_on_booking()
returns trigger as $$
begin
  if new.status = 'deposit_paid' and (old.status is null or old.status = 'pending') then
    update public.surf_camps
    set spots_taken = spots_taken + 1,
        status = case when spots_taken + 1 >= max_spots then 'full' else status end
    where id = new.camp_id;
  end if;
  if new.status = 'cancelled' and old.status in ('deposit_paid','fully_paid') then
    update public.surf_camps
    set spots_taken = greatest(spots_taken - 1, 0),
        status = case when status = 'full' then 'open' else status end
    where id = new.camp_id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_booking_status_change
  after insert or update of status on public.bookings
  for each row execute function public.update_spots_on_booking();

-- 4. SURF CLASSES (clases programadas)
-- ============================================================
create table public.surf_classes (
  id              uuid primary key default uuid_generate_v4(),
  type            text not null check (type in ('grupal','individual')),
  title           text not null,
  date            date not null,
  time_start      time not null,
  time_end        time not null,
  max_students    int not null default 8,
  price           numeric(8,2) not null,
  instructor      text,
  location        text default 'Playa de Roche',
  status          text not null default 'scheduled'
                    check (status in ('scheduled','completed','cancelled')),
  created_at      timestamptz not null default now()
);

comment on table public.surf_classes is 'Clases de surf programadas';

-- 5. CLASS BOOKINGS (reservas de clases)
-- ============================================================
create table public.class_bookings (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  class_id    uuid not null references public.surf_classes(id) on delete cascade,
  status      text not null default 'confirmed'
                check (status in ('confirmed','cancelled','completed')),
  amount      numeric(8,2) not null,
  created_at  timestamptz not null default now(),
  unique(user_id, class_id)
);

comment on table public.class_bookings is 'Reservas de clases de surf';

-- 6. EQUIPMENT RENTALS (alquiler de material)
-- ============================================================
create table public.equipment_rentals (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  equipment_type  text not null,
  date_start      date not null,
  date_end        date not null,
  status          text not null default 'active'
                    check (status in ('active','returned','cancelled')),
  amount          numeric(8,2) not null,
  notes           text,
  created_at      timestamptz not null default now()
);

comment on table public.equipment_rentals is 'Alquiler de material de surf';

-- 7. PRODUCTS (tienda)
-- ============================================================
create table public.products (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  slug        text not null unique,
  description text,
  price       numeric(8,2) not null,
  image_url   text,
  stock       int not null default 0,
  category    text,
  status      text not null default 'active'
                check (status in ('active','draft','out_of_stock')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.products is 'Productos de la tienda online';

-- 8. ORDERS (pedidos)
-- ============================================================
create table public.orders (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  status            text not null default 'pending'
                      check (status in ('pending','paid','shipped','delivered','cancelled')),
  total             numeric(8,2) not null,
  shipping_address  text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.orders is 'Pedidos de la tienda';

-- 9. ORDER ITEMS (líneas de pedido)
-- ============================================================
create table public.order_items (
  id          uuid primary key default uuid_generate_v4(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete restrict,
  quantity    int not null default 1 check (quantity > 0),
  unit_price  numeric(8,2) not null,
  created_at  timestamptz not null default now()
);

comment on table public.order_items is 'Líneas de cada pedido';

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Activar RLS en todas las tablas
alter table public.profiles          enable row level security;
alter table public.surf_camps        enable row level security;
alter table public.bookings          enable row level security;
alter table public.surf_classes      enable row level security;
alter table public.class_bookings    enable row level security;
alter table public.equipment_rentals enable row level security;
alter table public.products          enable row level security;
alter table public.orders            enable row level security;
alter table public.order_items       enable row level security;

-- Helper: ¿es admin?
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- PROFILES
create policy "Users read own profile"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

create policy "Users update own profile"
  on public.profiles for update
  using (id = auth.uid());

create policy "Admins manage all profiles"
  on public.profiles for all
  using (public.is_admin());

-- SURF CAMPS (público lectura, admin escritura)
create policy "Anyone can read camps"
  on public.surf_camps for select
  using (true);

create policy "Admins manage camps"
  on public.surf_camps for all
  using (public.is_admin());

-- BOOKINGS
create policy "Users read own bookings"
  on public.bookings for select
  using (user_id = auth.uid() or public.is_admin());

create policy "Users create own bookings"
  on public.bookings for insert
  with check (user_id = auth.uid());

create policy "Admins manage all bookings"
  on public.bookings for all
  using (public.is_admin());

-- SURF CLASSES (público lectura, admin escritura)
create policy "Anyone can read classes"
  on public.surf_classes for select
  using (true);

create policy "Admins manage classes"
  on public.surf_classes for all
  using (public.is_admin());

-- CLASS BOOKINGS
create policy "Users read own class bookings"
  on public.class_bookings for select
  using (user_id = auth.uid() or public.is_admin());

create policy "Users create own class bookings"
  on public.class_bookings for insert
  with check (user_id = auth.uid());

create policy "Admins manage all class bookings"
  on public.class_bookings for all
  using (public.is_admin());

-- EQUIPMENT RENTALS
create policy "Users read own rentals"
  on public.equipment_rentals for select
  using (user_id = auth.uid() or public.is_admin());

create policy "Users create own rentals"
  on public.equipment_rentals for insert
  with check (user_id = auth.uid());

create policy "Admins manage all rentals"
  on public.equipment_rentals for all
  using (public.is_admin());

-- PRODUCTS (público lectura, admin escritura)
create policy "Anyone can read products"
  on public.products for select
  using (true);

create policy "Admins manage products"
  on public.products for all
  using (public.is_admin());

-- ORDERS
create policy "Users read own orders"
  on public.orders for select
  using (user_id = auth.uid() or public.is_admin());

create policy "Users create own orders"
  on public.orders for insert
  with check (user_id = auth.uid());

create policy "Admins manage all orders"
  on public.orders for all
  using (public.is_admin());

-- ORDER ITEMS
create policy "Users read own order items"
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
        and (orders.user_id = auth.uid() or public.is_admin())
    )
  );

create policy "Users create order items"
  on public.order_items for insert
  with check (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
        and orders.user_id = auth.uid()
    )
  );

create policy "Admins manage all order items"
  on public.order_items for all
  using (public.is_admin());

-- ============================================================
-- ÍNDICES
-- ============================================================
create index idx_bookings_user        on public.bookings(user_id);
create index idx_bookings_camp        on public.bookings(camp_id);
create index idx_bookings_status      on public.bookings(status);
create index idx_class_bookings_user  on public.class_bookings(user_id);
create index idx_class_bookings_class on public.class_bookings(class_id);
create index idx_orders_user          on public.orders(user_id);
create index idx_order_items_order    on public.order_items(order_id);
create index idx_surf_classes_date    on public.surf_classes(date);
create index idx_equipment_user       on public.equipment_rentals(user_id);

-- ============================================================
-- SEED: Surf Camps actuales
-- ============================================================
insert into public.surf_camps (title, slug, kicker, date_start, date_end, price, original_price, deposit, max_spots, status, cart_id, hero_image) values
  ('Surf Camp Conil 20-23 Marzo',
   'surf-camp-20-23-marzo',
   'Surf Camp Conil',
   '2026-03-20', '2026-03-23',
   480, 580, 180, 17, 'open', 781,
   'https://entreolasurf.com/wp-content/uploads/2025/12/8.png'),

  ('Surf Camp XXL 10-13 Abril',
   'surf-camp-10abril-13abril',
   'Surf Camp XXL',
   '2026-04-10', '2026-04-13',
   480, 600, 180, 17, 'open', 801,
   'https://entreolasurf.com/wp-content/uploads/2026/02/DJI_0128-Editar.webp'),

  ('Surf Camp x Sambatrips 16-19 Abril',
   'surf-camp-16-19-abril-sambatrips',
   'Surf Camp x Sambatrips',
   '2026-04-16', '2026-04-19',
   580, null, 180, 17, 'open', 796,
   'https://entreolasurf.com/wp-content/uploads/2025/12/14.png'),

  ('Surf Camp x Sambatrips 9-13 Septiembre',
   'surf-camp-9-13-septiembre-sambatrips',
   'Surf Camp x Sambatrips',
   '2026-09-09', '2026-09-13',
   580, null, 180, 17, 'open', 802,
   'https://entreolasurf.com/wp-content/uploads/2025/12/13.png');
