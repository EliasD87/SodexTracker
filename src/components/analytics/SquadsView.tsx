"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Flag, Sparkles, Timer, Users } from "lucide-react";
import { count, pct } from "@/lib/analyticsFormat";
import { useApi, useCompact } from "@/components/analytics/hooks";
import { LiveDot, SegmentMeter, StatStrip } from "@/components/analytics/kit";
import { NoData } from "@/components/analytics/ui";
import { usePortfolio } from "@/components/PortfolioProvider";
import type { Squad, SquadsOverview } from "@/lib/squadStore";
import { DEFAULT_TIERS } from "@/lib/squadTiers";
import { EnergyTrack } from "@/components/squads/EnergyTrack";
import { Standings } from "@/components/squads/Standings";
import { WalletResult } from "@/components/squads/WalletResult";
import { ADDRESS, capOf, clock, plus, SEASON_WEEKS, utc, type Lookup, type Unavailable } from "@/components/squads/track";

/**
 * SoPoints squads: the season clock, every squad on one Energy track, any
 * wallet's two squads pinned on it, and the standings. All estimates from
 * public data; SoDEX shows the official figures only to a squad's members.
 */

const WEEK = 7 * 86_400_000;

/** The wallet in the page's link, if any. */
function linkedAddress(): string | null {
  if (typeof window === "undefined") return null;
  const a = new URLSearchParams(window.location.search).get("address");
  return a && ADDRESS.test(a) ? a.toLowerCase() : null;
}

/** Time left until a moment, ticking each minute. */
function useCountdown(at: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return at ? Math.max(0, at - now) : null;
}

export function SquadsView() {
  const compact = useCompact();
  const { savedAddress } = usePortfolio();
  const { data, error } = useApi<SquadsOverview | Unavailable>("/api/analytics/squads", 300_000, 600_000);
  // A shared link (/squads?address=0x…) opens that wallet's squads. Read once, in the browser; the
  // server renders only the skeleton (no data yet), so the two never disagree.
  const [input, setInput] = useState(() => linkedAddress() ?? "");
  const [bad, setBad] = useState(false);
  // `n` changes on every search, so searching the same wallet again asks again.
  const [query, setQuery] = useState<{ address: string; n: number } | null>(() => {
    const a = linkedAddress();
    return a ? { address: a, n: 0 } : null;
  });
  const lookup = useApi<Lookup | Unavailable>(query ? `/api/analytics/squads/lookup?address=${query.address}${query.n ? `&n=${query.n}` : ""}` : null, 300_000);
  // While a new search loads, the previous wallet's answer isn't shown as if it were this one's.
  const current = lookup.data && (!lookup.data.available || lookup.data.address === query?.address) && !lookup.loading ? lookup.data : null;
  const found = current?.available ? current : null;
  const overview = data?.available ? data : null;
  const left = useCountdown(overview?.season?.nextWeekAt ?? null);
  // The "Estimated" pill and any #method link open the note (Safari doesn't open <details> for a fragment).
  const [noteOpen, setNoteOpen] = useState(() => typeof window !== "undefined" && window.location.hash === "#method");
  useEffect(() => {
    const open = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.('a[href="#method"]')) setNoteOpen(true);
    };
    document.addEventListener("click", open);
    return () => document.removeEventListener("click", open);
  }, []);

  const derived = useMemo(() => {
    if (!overview) return null;
    const tiers = overview.season?.tiers?.length ? overview.season.tiers : DEFAULT_TIERS;
    const topBy = new Map(overview.top.map((q) => [q.captain, q]));
    return {
      tiers,
      cap: capOf(tiers, overview.top),
      rankBy: new Map(overview.top.map((q, i) => [q.captain, i + 1])),
      // A squad on the board shows the board's exact Energy; the per-wallet views carry it rounded.
      energyOf: (q: Squad) => topBy.get(q.captain)?.energy ?? q.energy,
      roughly: (q: Squad) => !topBy.has(q.captain),
    };
  }, [overview]);

  /** The one way into a lookup: the search, a pasted address, a chip, a dot, a board row, an address in a roster. */
  const go = (raw: string, from: "form" | "pick") => {
    const a = raw.trim().toLowerCase();
    if (!ADDRESS.test(a)) return setBad(true);
    setBad(false);
    setInput(a);
    setQuery((q) => ({ address: a, n: (q?.n ?? 0) + 1 }));
    try {
      history.replaceState(null, "", `/squads?address=${a}`);
    } catch {}
    requestAnimationFrame(() => {
      const el = document.getElementById(from === "pick" && !compact ? "track-map" : "result");
      if (el && (from === "pick" || el.getBoundingClientRect().top > window.innerHeight * 0.8)) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
  const retry = () => setQuery((q) => (q ? { ...q, n: q.n + 1 } : q));

  if (!data) {
    return error ? (
      <div className="mt-6">
        <NoData title="Squads" reason={error} />
      </div>
    ) : (
      <Skeleton />
    );
  }
  if (!overview || !derived) {
    return (
      <div className="mt-6">
        <NoData title="Squads" reason={(data as Unavailable).reason} />
      </div>
    );
  }

  const s = overview.season;
  const { asked, traders } = overview.coverage;
  const scanShare = traders ? asked / traders : 1;
  const scanning = asked < traders * 0.98;
  const boosted = overview.totals.byTier.slice(1).reduce((a, n) => a + n, 0);
  const inSeason = s?.week != null && s.week >= 1 && s.week <= SEASON_WEEKS;

  return (
    <div className="mt-5 sm:mt-6 grid grid-cols-1 gap-3 sm:gap-4">
      {scanning && (
        <div className="rounded-[14px] px-4 py-3 flex items-center gap-3" style={{ background: "var(--bg-elevated)" }}>
          <LiveDot />
          <span className="text-[12.5px] shrink-0" style={{ color: "var(--text-muted)" }}>
            Mapping squads
          </span>
          <span className="flex-1 h-[4px] rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
            <span className="lb-bar block h-full rounded-full" style={{ width: `${scanShare * 100}%`, background: "var(--sq-t1)" }} />
          </span>
          <span className="shrink-0 mono text-[12px] font-semibold" style={{ color: "var(--text)" }}>
            {pct(scanShare, 0)}
          </span>
        </div>
      )}

      <StatStrip className="grid-cols-2 md:grid-cols-4">
        <SeasonCell
          icon={<Flag size={13} />}
          label="Season"
          value={
            s?.weekName ? (
              <>
                {s.weekName}
                {inSeason && (
                  <span className="text-[13px] font-normal" style={{ color: "var(--text-faint)" }}>
                    {" "}
                    of {SEASON_WEEKS}
                  </span>
                )}
              </>
            ) : (
              "—"
            )
          }
          meter={inSeason ? <SegmentMeter segments={SEASON_WEEKS} share={s!.week! / SEASON_WEEKS} height={6} /> : null}
          caption={s ? "Layer 1" : "Not in yet"}
        />
        <SeasonCell
          icon={<Timer size={13} />}
          label="Next snapshot"
          value={
            left == null ? (
              "—"
            ) : left > 0 ? (
              clock(left)
            ) : (
              <span className="inline-flex items-center gap-2">
                Updating
                <span className="dot-wave inline-flex gap-[3px]">
                  <span />
                  <span />
                  <span />
                </span>
              </span>
            )
          }
          meter={left != null ? <SegmentMeter segments={7} share={Math.max(0, Math.min(1, 1 - left / WEEK))} height={6} /> : null}
          caption={left == null ? "Not in yet" : left > 0 ? utc(s!.nextWeekAt!) : "Within the hour"}
        />
        <SeasonCell
          icon={<Sparkles size={13} />}
          label="SoPoints this week"
          value={s?.pool ? (s.pool >= 1e6 ? `${+(s.pool / 1e6).toFixed(2)}M` : count(s.pool)) : "—"}
          caption={s?.distributionAt ? `Paid ${day(s.distributionAt)}` : s ? "Shared pool" : "Not in yet"}
        />
        <SeasonCell
          icon={<Users size={13} />}
          label="Squads"
          value={count(overview.totals.squads)}
          caption={`${count(boosted)} boosted · ${count(overview.totals.members)} active members`}
        />
      </StatStrip>

      <EnergyTrack
        data={overview}
        tiers={derived.tiers}
        cap={derived.cap}
        energyOf={derived.energyOf}
        roughly={derived.roughly}
        found={found}
        loading={lookup.loading}
        query={query?.address ?? null}
        input={input}
        setInput={(v) => {
          setInput(v);
          if (bad) setBad(false);
        }}
        bad={bad}
        go={go}
        savedAddress={savedAddress}
      />

      {query &&
        (!current ? (
          lookup.error && !lookup.loading ? (
            <div className="flex flex-wrap items-center gap-3 text-[13px]" style={{ color: "var(--text-faint)" }}>
              {lookup.error}
              <button
                type="button"
                onClick={retry}
                className="h-8 px-3 text-[12px] font-medium border border-[var(--border)] hover:bg-[var(--bg-elevated)] cursor-pointer"
                style={{ borderRadius: 9, color: "var(--text)" }}
              >
                Try again
              </button>
            </div>
          ) : (
            <section id="result" aria-busy className="grid gap-3 sm:gap-4 scroll-mt-[72px]">
              <div className="animate-pulse h-[188px] lg:h-[164px]" style={{ background: "var(--bg-elevated)", borderRadius: "var(--card-radius)" }} />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                {[0, 1].map((i) => (
                  <div key={i} className="animate-pulse h-[420px]" style={{ background: "var(--bg-elevated)", borderRadius: "var(--card-radius)" }} />
                ))}
              </div>
            </section>
          )
        ) : !current.available ? (
          <div id="result" className="text-[13px]" style={{ color: "var(--text-faint)" }}>
            {current.reason}
          </div>
        ) : (
          <WalletResult
            r={current}
            data={overview}
            tiers={derived.tiers}
            cap={derived.cap}
            energyOf={derived.energyOf}
            roughly={derived.roughly}
            rankBy={derived.rankBy}
            go={go}
            retry={retry}
          />
        ))}

      <Standings data={overview} tiers={derived.tiers} cap={derived.cap} rankBy={derived.rankBy} found={found} go={go} />

      <details id="method" className="sq-note scroll-mt-[72px] px-1" open={noteOpen} onToggle={(e) => setNoteOpen(e.currentTarget.open)}>
        <summary className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: "var(--text-muted)" }}>
          How we estimate <ChevronDown size={13} className="sq-chev transition-transform" />
        </summary>
        <ul className="mt-2 grid gap-1 text-[11.5px] leading-relaxed list-disc pl-4" style={{ color: "var(--text-faint)" }}>
          <li>From public data, updated hourly. SoDEX shows the official figures only to a squad&apos;s members.</li>
          <li>Squad: a captain and every wallet that joined with their code.</li>
          <li>
            Energy: the captain&apos;s and active members&apos; trading volume this week and the 3 before it (from Tuesday 12:00 UTC), $1 = 1. A member with a
            squad of its own adds to that one instead.
          </li>
          <li>Active member: deposited $5 and traded.</li>
          <li>Boosts from the squad you joined and the one you built add up to {plus(s?.maxBoost ?? 0.5)}; joining with a code adds +5%.</li>
          {overview.window.dataFrom > overview.window.from && (
            <li>
              Our trade records start {overview.window.dataFrom}
              {overview.window.filled ? "; earlier days come from SoDEX's own trade history (or its 30-day volume, until that's read)" : ""}.
            </li>
          )}
          <li>One wallet&apos;s squads are rounded (≈). As of {utc(overview.asOf)}.</li>
        </ul>
      </details>
    </div>
  );
}

/** "Fri 30 Oct". */
const day = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

function SeasonCell({ icon, label, value, meter, caption }: { icon: React.ReactNode; label: string; value: React.ReactNode; meter?: React.ReactNode; caption?: string }) {
  return (
    <div className="flex flex-col h-full min-w-0 px-4 sm:px-5 py-3.5 sm:py-4" style={{ background: "var(--bg-surface)" }}>
      <div className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: "var(--text-muted)" }}>
        <span style={{ color: "var(--text-faint)" }}>{icon}</span>
        {label}
      </div>
      <div className="mt-1.5 text-[20px] sm:text-[22px] font-semibold leading-none tabular-nums" style={{ color: "var(--text)", letterSpacing: "-0.025em" }}>
        {value}
      </div>
      {meter && <div className="mt-2.5">{meter}</div>}
      {caption && (
        <div className="mt-auto pt-2 text-[11.5px] truncate" style={{ color: "var(--text-muted)" }} title={caption}>
          {caption}
        </div>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="mt-5 sm:mt-6 grid gap-3 sm:gap-4" aria-busy>
      {["h-[150px] md:h-[100px]", "h-[470px] sm:h-[420px]", "h-[520px]"].map((h) => (
        <div key={h} className={`animate-pulse ${h}`} style={{ background: "var(--bg-elevated)", borderRadius: "var(--card-radius)" }} />
      ))}
    </div>
  );
}
