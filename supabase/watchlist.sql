create table if not exists public.watchlist_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.watchlist_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.watchlist_groups(id) on delete cascade,
  name text not null,
  address text not null,
  color text not null default '#35C77F',
  created_at timestamptz not null default now(),
  unique (user_id, address)
);

alter table public.watchlist_groups enable row level security;
alter table public.watchlist_addresses enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.watchlist_groups to authenticated;
grant select, insert, update, delete on public.watchlist_addresses to authenticated;

drop policy if exists "Users can read their own watchlist groups" on public.watchlist_groups;
drop policy if exists "Users can create their own watchlist groups" on public.watchlist_groups;
drop policy if exists "Users can update their own watchlist groups" on public.watchlist_groups;
drop policy if exists "Users can delete their own watchlist groups" on public.watchlist_groups;
drop policy if exists "Users can read their own watchlist addresses" on public.watchlist_addresses;
drop policy if exists "Users can create their own watchlist addresses" on public.watchlist_addresses;
drop policy if exists "Users can update their own watchlist addresses" on public.watchlist_addresses;
drop policy if exists "Users can delete their own watchlist addresses" on public.watchlist_addresses;

create policy "Users can read their own watchlist groups"
  on public.watchlist_groups
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own watchlist groups"
  on public.watchlist_groups
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own watchlist groups"
  on public.watchlist_groups
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own watchlist groups"
  on public.watchlist_groups
  for delete
  using (auth.uid() = user_id);

create policy "Users can read their own watchlist addresses"
  on public.watchlist_addresses
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own watchlist addresses"
  on public.watchlist_addresses
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own watchlist addresses"
  on public.watchlist_addresses
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own watchlist addresses"
  on public.watchlist_addresses
  for delete
  using (auth.uid() = user_id);
