# SoDEX Tracker

## What it does

SoDEX Tracker is a companion analytics and intelligence layer for traders on SoDEX. It turns raw on-chain trading activity and SoSoValue's index data into things a trader can actually act on:

- **Index X-ray** — decomposes SoSoValue's tokenized `.ssi` index products (MAG7, DeFi, Meme, and the rest) into their real constituents, showing live constituent prices, each token's weight, and how much it contributes to the index. It also surfaces which of those indices are tradable on SoDEX.
- **Portfolio Look-Through** — paste any wallet and it decomposes the index positions it holds into the *underlying* token exposure, rendered as a horizontal Sankey diagram so you can see your true concentration at a glance (dust folds into "Others"). There's a standalone address-paste version on the Intelligence page too — no wallet binding required.
- **Copy Trading assistant** — pick a leader from the SoDEX PnL leaderboard and it builds a mirror plan sized to your account: per-position TP/SL with risk-to-stop and R:R, a vetting checklist derived from the leader's recent 200 trades, a per-market track record, and drift detection. One click hands the trade off to the paper terminal.
- **Demo / paper trading terminal** — a full perps simulator with a proper one-way netting engine (weighted-average entry, reduce/flip, liquidation, funding), so you can rehearse a strategy or a copied trade with zero risk.
- **Journal, watchlists, and reverse-search** over SoDEX markets, plus a live intelligence feed.

Everything runs on real data. Nothing is mocked.

## The problem it solves

Perps traders are flying blind in two directions at once. Tokenized index products like the `.ssi` series are convenient to hold but opaque — you own "MAG7" without really knowing your live exposure to any single name inside it, or how correlated your "diversified" bag actually is. And copy trading usually means blindly mirroring a leaderboard number with no sense of the risk you're inheriting.

SoDEX Tracker closes both gaps. It makes index holdings *transparent* by decomposing them down to constituent-level exposure, and it makes copy trading *legible* by turning a leader's history into a vetted, risk-sized plan you can rehearse before committing. It's the analytics layer that sits between "here's a chart" and "here's what you're actually holding and what it would cost you."

## Challenges I ran into

- **Respecting a hard API budget.** SoSoValue's plan caps at 100k requests/month and 20/min. Calling it on every page view would burn that in a day. I designed a four-tier cache chain — in-memory → on-disk → Supabase → live fetch — so the app makes just **two calls per day (every 12h)** and serves everything else from cache. A self-chaining Supabase edge function does the heavy refresh, segmenting its work to survive the free-tier 150-second wall-clock limit.
- **Data integrity across time gaps.** Once you cache aggressively, comparing a *live* mark price against a *12-hour-old* cached index price produces garbage signals (I hit a phantom "+100 bps venue premium" this way). I made it a hard rule: never compare two data points that can have a large time gap. Every comparison now uses a single live source, and anything that genuinely needed intraday freshness was removed rather than faked.
- **Getting the perps engine actually correct.** The demo terminal had to be 100% right before I let copy trading auto-create trades through it. I rewrote the netting logic (increase-weighted-average, reduce, flip), the liquidation monitor (priority ordering of LIQ > TP > SL, force-close capped at margin), and fixed a phantom-reopen bug on limit fills — then verified each path headlessly with Playwright.
- **A modified Next.js.** The stack runs a customized Next.js 16 with a modified Turbopack, so training-data assumptions didn't hold — I had to read the bundled docs before writing route code (async params as promises, etc.).
- **The little things.** Correcting index *level* (pts) vs. *price* (USD) on the cards, the right SoSoValue host, a self-chaining refresh that wouldn't disturb the three existing purposes already on that Supabase project, and an animated candlestick logo that flickers green/red before resolving to the white mark.

## Technologies I used

- **Next.js 16** (React, client components, CSS custom-property theming, light/dark aware) — customized build with modified Turbopack
- **SoSoValue OpenAPI** — index lists, constituents, snapshots, currency data, ETF flows, macro events
- **SoDEX gateways** — positions, account state, markets, leaderboard, portfolio overview, and trade history
- **Supabase** — Postgres cache table with RLS, a Deno **edge function** for the 12h refresh, and **pg_cron** scheduling
- **Playwright** — headless verification of the trading engine and UI
- **Hand-rolled SVG dataviz** — Sankey look-through, weighted donut charts, sparklines, animated logo
- **Python 3.10+** — standalone downloadable strategy bots (zero-dependency, paper mode on live SoDEX data)

## How we built it

I started by auditing what SoDEX exposes versus what SoSoValue adds, and drew a clean client/server line: SoDEX watchlists and reverse-search stay client-side, while all SoSoValue calls go server-side behind the cache. Then I built outward from the data:

1. **The cache spine first** — memory → disk → Supabase → network, with 12h TTLs, so every feature I added inherited safe, budgeted data access for free.
2. **The refresh pipeline** — a self-chaining edge function that prewarms every index's constituents and snapshots, writes a `last_run` summary each segment, and runs on a 12-hour cron, all without touching the tables already living in that Supabase project.
3. **Intelligence features on top** — Index X-ray, then Portfolio Look-Through, iterating the visualization from a plain bar list through a radial fan to the final horizontal Sankey, optimized for mobile.
4. **The trading surface** — a correct paper-trading engine, then a Copy Trading assistant layered over it, connected by a one-click bridge that simulates the copied trade with the leader's sizing, TP, and SL.
5. **Polish** — a "Tools" nav section, distinct minimal icons for all 13 sectors, monochrome-consistent design, and the animated candlestick wordmark.

## What we learned

- **Caching is a feature, not an optimization.** The moment you decide to hit an API twice a day instead of on every request, it reshapes the whole product — which comparisons are honest, which features can even exist, and where "fresh" genuinely matters. Designing around the budget up front produced a cleaner app than bolting caching on later would have.
- **Honest data beats impressive data.** Every time I was tempted to fill a gap with a mock or a cross-time comparison, it eventually surfaced as a wrong number. Removing the feature was always better than faking it.
- **Correctness needs a harness.** A perps netting engine has too many edge cases to eyeball. Driving it with headless scripts to assert liquidation, flip, and reduce behavior caught bugs I would never have found by clicking around.

## What's next for SoDEX Tracker

- **Trading Bots, live.** Six named strategy bots already exist as downloadable, zero-dependency Python you can run locally against live SoDEX data — currently behind a "coming soon" overlay. Next is hosted deployment so they can run server-side without your machine.
- **From assistant to execution.** Copy Trading is deliberately an *assistant* today; the natural next step is opt-in signed execution once the vetting and risk-sizing layer has earned trust.
- **Deeper index intelligence** — historical NAV once index klines are available on the plan, correlation clustering across a portfolio's look-through, and alerts when a wallet's true underlying exposure drifts past a threshold.
- **Broader coverage** — more pairs and indices as SoDEX and SoSoValue expand, all flowing through the same cached, budget-safe pipeline.
