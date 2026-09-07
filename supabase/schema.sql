create extension if not exists pgcrypto;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  legal_name text,
  phone text,
  email text,
  logo_url text,
  plan text not null default 'base' check (plan in ('base','premium')),
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('owner_manager','courier')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  description text,
  price numeric(12,2) not null default 0,
  image_url text,
  is_available boolean not null default true,
  is_sold_out boolean not null default false,
  is_featured boolean not null default false,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.product_options (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  option_type text not null check (option_type in ('extra','variant')),
  price_delta numeric(12,2) not null default 0,
  is_required boolean not null default false,
  is_available boolean not null default true,
  sort_order int not null default 0
);

create table if not exists public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  delivery_fee numeric(12,2) not null default 0,
  estimated_minutes int,
  is_active boolean not null default true
);

create table if not exists public.couriers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  profile_user_id uuid references public.profiles(user_id) on delete set null,
  name text not null,
  phone text,
  is_active boolean not null default true
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_number bigint generated always as identity,
  customer_name text not null,
  customer_phone text not null,
  fulfillment_type text not null check (fulfillment_type in ('pickup','delivery')),
  address text,
  address_reference text,
  delivery_zone_id uuid references public.delivery_zones(id) on delete set null,
  subtotal numeric(12,2) not null default 0,
  delivery_fee numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  payment_method text not null,
  payment_status text not null default 'pending' check (payment_status in ('pending','to_verify','confirmed','rejected')),
  order_status text not null default 'new' check (order_status in ('new','accepted','preparing','ready','on_the_way','delivered','cancelled')),
  courier_id uuid references public.couriers(id) on delete set null,
  estimated_minutes int,
  is_delayed boolean not null default false,
  notes text,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name_snapshot text not null,
  quantity int not null check (quantity > 0),
  unit_price_snapshot numeric(12,2) not null,
  options_snapshot jsonb not null default '[]'::jsonb,
  item_subtotal numeric(12,2) not null,
  notes text
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  method text not null,
  amount numeric(12,2) not null,
  status text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  receipt_url text,
  notes text,
  confirmed_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.courier_trips (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  courier_id uuid not null references public.couriers(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  delivery_zone_id uuid references public.delivery_zones(id) on delete set null,
  trip_value numeric(12,2) not null default 0,
  status text not null default 'assigned' check (status in ('assigned','on_the_way','delivered')),
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  description text,
  promo_price numeric(12,2),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true
);

create table if not exists public.business_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  address text,
  maps_url text,
  primary_color text,
  secondary_color text,
  pwa_name text,
  pwa_icon_url text,
  pickup_enabled boolean not null default true,
  delivery_enabled boolean not null default true,
  orders_paused boolean not null default false,
  preparation_minutes int not null default 20,
  transfer_enabled boolean not null default true,
  cash_enabled boolean not null default true,
  wallet_enabled boolean not null default true,
  card_enabled boolean not null default false,
  transfer_alias text,
  transfer_holder text,
  chatbot_greeting text,
  updated_at timestamptz not null default now()
);

create table if not exists public.business_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  is_closed boolean not null default false,
  opens_at time,
  closes_at time,
  unique (business_id, weekday)
);

create table if not exists public.daily_summaries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  summary_date date not null,
  orders_count int not null default 0,
  cancelled_count int not null default 0,
  pickup_count int not null default 0,
  delivery_count int not null default 0,
  gross_sales numeric(12,2) not null default 0,
  delivery_fees numeric(12,2) not null default 0,
  unique (business_id, summary_date)
);

create index if not exists idx_categories_business on public.categories(business_id);
create index if not exists idx_products_business on public.products(business_id);
create index if not exists idx_orders_business_created on public.orders(business_id, created_at desc);
create index if not exists idx_orders_business_status on public.orders(business_id, order_status);
create index if not exists idx_order_items_order on public.order_items(order_id);
create index if not exists idx_payments_order on public.payments(order_id);
create index if not exists idx_trips_business_created on public.courier_trips(business_id, created_at desc);

-- RLS: cada usuario operativo solo ve datos de su comercio.
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_options enable row level security;
alter table public.delivery_zones enable row level security;
alter table public.couriers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.courier_trips enable row level security;
alter table public.promotions enable row level security;
alter table public.business_settings enable row level security;
alter table public.business_hours enable row level security;
alter table public.daily_summaries enable row level security;

create or replace function public.current_business_id()
returns uuid
language sql
stable
as $$
  select p.business_id from public.profiles p where p.user_id = auth.uid() and p.is_active = true
$$;

-- Ejemplo de políticas de aislamiento. Repetimos el patrón por tabla.
create policy "profiles_same_business" on public.profiles
for select using (business_id = public.current_business_id());

create policy "categories_same_business" on public.categories
for all using (business_id = public.current_business_id()) with check (business_id = public.current_business_id());

create policy "products_same_business" on public.products
for all using (business_id = public.current_business_id()) with check (business_id = public.current_business_id());

create policy "product_options_same_business" on public.product_options
for all using (business_id = public.current_business_id()) with check (business_id = public.current_business_id());

create policy "delivery_zones_same_business" on public.delivery_zones
for all using (business_id = public.current_business_id()) with check (business_id = public.current_business_id());

create policy "couriers_same_business" on public.couriers
for all using (business_id = public.current_business_id()) with check (business_id = public.current_business_id());

create policy "orders_same_business" on public.orders
for all using (business_id = public.current_business_id()) with check (business_id = public.current_business_id());

create policy "order_items_same_business" on public.order_items
for all using (business_id = public.current_business_id()) with check (business_id = public.current_business_id());

create policy "payments_same_business" on public.payments
for all using (business_id = public.current_business_id()) with check (business_id = public.current_business_id());

create policy "courier_trips_same_business" on public.courier_trips
for all using (business_id = public.current_business_id()) with check (business_id = public.current_business_id());

create policy "promotions_same_business" on public.promotions
for all using (business_id = public.current_business_id()) with check (business_id = public.current_business_id());

create policy "business_settings_same_business" on public.business_settings
for all using (business_id = public.current_business_id()) with check (business_id = public.current_business_id());

create policy "business_hours_same_business" on public.business_hours
for all using (business_id = public.current_business_id()) with check (business_id = public.current_business_id());

create policy "daily_summaries_same_business" on public.daily_summaries
for all using (business_id = public.current_business_id()) with check (business_id = public.current_business_id());

-- La carta pública debe exponerse mediante endpoints/server actions que validen slug + business_id.
-- No se habilita acceso público directo a todas las tablas.
