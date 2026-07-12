# SoSoValue 12h refresh — setup (dashboard only, no CLI)

Do these in order. Everything happens at supabase.com/dashboard in your existing project.
Nothing here touches watchlist_groups / watchlist_addresses / sodex_addresses.

**You need two values:**
- `PROJECT_REF` — the subdomain of your `NEXT_PUBLIC_SUPABASE_URL` (https://`abcdefgh`.supabase.co → `abcdefgh`)
- `CRON_SECRET` — a password YOU invent now (long random string). Used in steps 4, 6, 7.

---

### 1. Create the table
SQL Editor → New query → paste everything from `supabase/sosovalue_cache.sql`
**above** the "SCHEDULING" comment block → Run.
✓ Success: "Success. No rows returned"

### 2. Deploy the edge function
Edge Functions (⚡ in sidebar) → **Deploy a new function** → **Via Editor**
- Name: `sosovalue-refresh` (exactly)
- Delete the template, paste ALL of `supabase/functions/sosovalue-refresh/index.ts`
- Click **Deploy**

### 3. Turn off JWT verification
On the function's page → **Details / Settings** → toggle **"Enforce JWT verification" OFF** → save.
(Our own `x-cron-secret` check in the code is the auth instead.)

### 4. Add the two secrets
Edge Functions → **Secrets** → add:
- `SOSOVALUE_API_KEY` = the key from your `.env.local`
- `CRON_SECRET` = the random string you invented

### 5. Run it once, manually
On the function's page use the **Test/Invoke** panel: method POST, add header
`x-cron-secret: <your CRON_SECRET>` → Send.
Or from PowerShell:
```powershell
curl.exe -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/sosovalue-refresh" -H "x-cron-secret: <CRON_SECRET>"
```
✓ Success: `{"started":true}` immediately. The fetching continues ~4 min in the background.

### 6. Verify it filled the table (wait ~4 minutes)
SQL Editor:
```sql
select data from public.sosovalue_cache where key = 'meta:last_run';
```
✓ Success: `{"calls": ~66, "rows_written": ~66, "errors": [], ...}`

### 7. Schedule it — run it OFTEN, not every 12h
Integrations → **Cron** → enable if prompted → **Create job**:
- Name: `sosovalue-refresh`
- Schedule: `*/15 * * * *`  ← **every 15 minutes** (see below)
- Type: **Supabase Edge Function** → pick `sosovalue-refresh` (it exists now, after step 2)
- Method: POST
- HTTP Headers: `x-cron-secret` = your CRON_SECRET
- Save.

**Why every 15 min and not every 12h?** The full refresh is ~141 API calls
(~7.5 min), but the free-tier edge limit kills a run at ~150s (~30 calls). One
run therefore only does a *segment* and defers the rest. A frequent cron drives
those segments to completion: each run skips rows that are still fresh (< 11h
old) and fetches only what's stale, so it converges in ~5 runs and then idles —
an all-fresh run makes **0** SoSoValue calls (it just checks the table). This is
robust because it relies only on the cron→function path.

> A 12-hour schedule (`0 */12 * * *`) leaves the segmented refresh permanently
> incomplete unless the fragile self-chain happens to work — which on the free
> tier it usually doesn't. That's the bug that left Pair-Intelligence / ETF /
> macro data stale while only the indices refreshed. Use the frequent cron.

Done. The app reads the table automatically (memory → disk → Supabase → direct
fetch fallback) — no app config changes needed.

**Later checks:** re-run the step-6 query anytime; `fetched_at` on rows shows the last refresh.
**Unschedule:** Integrations → Cron → delete the job (or `select cron.unschedule('sosovalue-refresh-12h');`).
