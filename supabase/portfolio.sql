create table if not exists public.portfolio_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  address text not null,
  created_at timestamptz not null default now(),
  unique (user_id, address)
);

alter table public.portfolio_addresses enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.portfolio_addresses to authenticated;

drop policy if exists "Users can read their own portfolio address" on public.portfolio_addresses;
drop policy if exists "Users can create their own portfolio address" on public.portfolio_addresses;
drop policy if exists "Users can update their own portfolio address" on public.portfolio_addresses;
drop policy if exists "Users can delete their own portfolio address" on public.portfolio_addresses;

create policy "Users can read their own portfolio address"
  on public.portfolio_addresses
  for select
  using (auth.uid() = user_id);

create policy "Users can create their own portfolio address"
  on public.portfolio_addresses
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own portfolio address"
  on public.portfolio_addresses
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own portfolio address"
  on public.portfolio_addresses
  for delete
  using (auth.uid() = user_id);
