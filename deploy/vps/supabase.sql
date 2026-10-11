-- Live views published from the VPS. Run once in Supabase: SQL Editor → New query → Run.
-- One row per page view (positions, rankings, a market's live section, a trader page...),
-- replaced in place when it changes. Expect a few thousand rows and tens of MB at most.

create table if not exists public.live_snapshots (
  key        text primary key,
  data       jsonb not null,
  hash       text not null,
  updated_at timestamptz not null default now()
);

create index if not exists live_snapshots_updated on public.live_snapshots (updated_at);

-- Anyone may read (the site uses the public anon key). Nobody may write except the
-- service role key, which bypasses row security and lives only on the VPS.
alter table public.live_snapshots enable row level security;

drop policy if exists "live snapshots are public" on public.live_snapshots;
create policy "live snapshots are public" on public.live_snapshots for select using (true);

-- Newer Supabase projects don't grant access to new tables automatically.
-- Writes: the VPS's service key (inserts, updates, and deleting stale rows).
-- Reads: the site's anon key.
grant select, insert, update, delete on public.live_snapshots to service_role;
grant select on public.live_snapshots to anon, authenticated;
