-- ════════════════════════════════════════════════════════════════
-- SoSoValue 12h data cache
-- Fully isolated: one new table, no references to any existing table
-- (watchlist_groups / watchlist_addresses / sodex_addresses untouched).
--
-- Write model: ONLY the sosovalue-refresh edge function (service role)
-- writes, overwriting each key on its 12h schedule. The app reads via
-- the anon key (public market data, read-only policy).
-- ════════════════════════════════════════════════════════════════

create table if not exists public.sosovalue_cache (
  key text primary key,          -- e.g. 'soso:/indices/ssiMAG7/market-snapshot'
  data jsonb not null,           -- the unwrapped SoSoValue `data` payload
  fetched_at timestamptz not null default now()
);

alter table public.sosovalue_cache enable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant select on public.sosovalue_cache to anon, authenticated;
-- the edge function writes with the service role — explicit grant required
-- (do not rely on project default privileges)
grant select, insert, update, delete on public.sosovalue_cache to service_role;

drop policy if exists "Anyone can read sosovalue cache" on public.sosovalue_cache;
create policy "Anyone can read sosovalue cache"
  on public.sosovalue_cache
  for select
  using (true);

-- Deliberately NO insert/update/delete policies:
-- only the service role (used by the edge function) can write.

-- ════════════════════════════════════════════════════════════════
-- SCHEDULING (run AFTER deploying the edge function — see README steps)
-- Requires the pg_cron + pg_net extensions (Dashboard → Database →
-- Extensions), or use Dashboard → Integrations → Cron instead.
-- Replace <PROJECT_REF> and <CRON_SECRET>, then run:
-- ════════════════════════════════════════════════════════════════
--
-- select cron.schedule(
--   'sosovalue-refresh-12h',
--   '0 */12 * * *',   -- 00:00 and 12:00 UTC
--   $$
--   select net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/sosovalue-refresh',
--     headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>'),
--     body := '{}'::jsonb
--   );
--   $$
-- );
--
-- To inspect the last run:  select data from public.sosovalue_cache where key = 'meta:last_run';
-- To unschedule:            select cron.unschedule('sosovalue-refresh-12h');
