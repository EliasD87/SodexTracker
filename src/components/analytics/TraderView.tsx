"use client";

import Link from "next/link";
import { ArrowLeft, Bell } from "lucide-react";
import type { TraderProfile, TraderResult } from "@/lib/traderStore";
import { count, pct, usd } from "@/lib/analyticsFormat";
import { useApi } from "@/components/analytics/hooks";
import { TileSkeleton } from "@/components/analytics/ui";
import { BiasTag, groupRule, Kpi, Panel, SegmentMeter, SplitBar } from "@/components/analytics/kit";
import { TokenIcon } from "@/components/TokenIcon";

/**
 * One trader, under their nickname: groups, equity, open positions valued
 * live, money in and out, and recent trading. No address is ever shown.
 */

const LONG = "var(--green)";
const SHORT = "var(--red)";
const signedUsd = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${usd(Math.abs(n))}`;
const tone = (n: number) => (n > 0 ? "var(--green)" : n < 0 ? "var(--red)" : "var(--text-muted)");
const price = (p: number) => (p >= 1000 ? p.toLocaleString("en-US", { maximumFractionDigits: 0 }) : p >= 1 ? p.toFixed(2) : p.toPrecision(4));
const when = (ms: number) =>
  new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
const age = (ms: number) => {
  const h = (Date.now() - ms) / 3_600_000;
  return h < 24 ? `${Math.max(1, Math.round(h))}h` : `${Math.round(h / 24)}d`;
};

/** A group the trader is in; hovering it says what puts them there. */
function Badge({ children }: { children: string }) {
  const rule = groupRule(children);
  return (
    <span
      title={rule}
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11.5px] font-medium ${rule ? "cursor-help" : ""}`}
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}
    >
      {children}
    </span>
  );
}

function Positions({ t }: { t: TraderProfile }) {
  if (!t.positions.length)
    return (
      <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>
        No open positions{t.positionsAt ? ` as of ${when(t.positionsAt)} UTC` : ""}.
      </p>
    );
  return (
    <table className="w-full text-[12.5px]">
      <thead>
        <tr style={{ color: "var(--text-faint)" }}>
          <th className="text-left font-normal py-2">Market</th>
          <th className="text-right font-normal py-2 px-2">Size</th>
          <th className="text-right font-normal py-2 px-2 hidden md:table-cell">Entry</th>
          <th className="text-right font-normal py-2 px-2 hidden md:table-cell">Mark</th>
          <th className="text-right font-normal py-2 px-2 hidden sm:table-cell">Liquidation</th>
          <th className="text-left font-normal py-2 px-2 w-[130px] hidden lg:table-cell">Distance</th>
          <th className="text-right font-normal py-2 px-2 hidden lg:table-cell">Age</th>
          <th className="text-right font-normal py-2">Unrealised</th>
        </tr>
      </thead>
      <tbody className="mono" style={{ fontVariantNumeric: "tabular-nums" }}>
        {t.positions.map((p) => (
          <tr key={`${p.market}-${p.side}`} style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <td className="py-2.5 font-sans">
              <span className="inline-flex items-center gap-2" style={{ color: "var(--text)" }}>
                <TokenIcon symbol={p.market} size={18} />
                <span className="font-semibold">{p.market.replace("-USD", "")}</span>
                <span className="text-[10.5px] font-semibold" style={{ color: p.side === "LONG" ? LONG : SHORT }}>
                  {p.side}
                </span>
                {/* Leverage steps out on a phone, where the row has room for three figures only. */}
                {p.leverage && (
                  <span className="text-[11px] hidden sm:inline" style={{ color: "var(--text-faint)" }}>
                    {p.leverage}× {p.marginMode === "ISOLATED" ? "isolated" : "cross"}
                  </span>
                )}
              </span>
            </td>
            <td className="py-2.5 px-2 text-right" style={{ color: "var(--text)" }}>
              {usd(p.notional)}
            </td>
            <td className="py-2.5 px-2 text-right hidden md:table-cell" style={{ color: "var(--text-muted)" }}>
              {price(p.entry)}
            </td>
            <td className="py-2.5 px-2 text-right hidden md:table-cell" style={{ color: "var(--text-muted)" }}>
              {price(p.mark)}
            </td>
            <td className="py-2.5 px-2 text-right hidden sm:table-cell" style={{ color: "var(--text-muted)" }}>
              {p.liq ? price(p.liq) : "—"}
            </td>
            <td className="py-2.5 px-2 hidden lg:table-cell">
              {p.distance != null && p.distance >= 0 ? (
                <span className="flex items-center gap-2">
                  <span className="flex-1">
                    <SegmentMeter share={1 - Math.min(1, p.distance / 0.5)} segments={10} color={p.distance < 0.05 ? SHORT : "var(--tier-niche)"} />
                  </span>
                  <span className="text-[11px] w-10 text-right" style={{ color: "var(--text)" }}>
                    {pct(p.distance, p.distance < 0.1 ? 1 : 0)}
                  </span>
                </span>
              ) : (
                <span style={{ color: "var(--text-faint)" }}>—</span>
              )}
            </td>
            <td className="py-2.5 px-2 text-right hidden lg:table-cell" style={{ color: "var(--text-faint)" }}>
              {p.openedAt ? age(p.openedAt) : "—"}
            </td>
            <td className="py-2.5 text-right" style={{ color: tone(p.upnl) }}>
              {signedUsd(p.upnl)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Money({ t }: { t: TraderProfile }) {
  const m = t.money;
  if (!m || !m.read)
    return (
      <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>
        This trader&apos;s deposits and withdrawals haven&apos;t been read yet.
      </p>
    );
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {/* Smaller figures on a phone, so three sit side by side. */}
        {[
          ["Deposited", m.in, "var(--text)"],
          ["Withdrawn", m.out, "var(--text)"],
          ["Net", m.in - m.out, tone(m.in - m.out)],
        ].map(([label, v, c]) => (
          <div key={label as string} className="min-w-0 rounded-[12px] px-2.5 sm:px-3 py-2.5" style={{ background: "var(--bg-elevated)" }}>
            <div className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
              {label}
            </div>
            <div className="mono text-[14px] sm:text-[17px] font-semibold mt-0.5 truncate" style={{ color: c as string }}>
              {label === "Net" ? signedUsd(v as number) : `≈${usd(v as number)}`}
            </div>
          </div>
        ))}
      </div>
      {m.chains.length > 0 && (
        <p className="mt-3 text-[11.5px]" style={{ color: "var(--text-faint)" }}>
          Chains used: {m.chains.join(", ")}
        </p>
      )}
      {m.recent.length > 0 && (
        <ul className="mt-3">
          {m.recent.map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-1.5 text-[12.5px]" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <span className="mono shrink-0" style={{ color: "var(--text-faint)" }}>
                {when(r.hour)}
              </span>
              <span className="flex-1 min-w-0 inline-flex items-center gap-2" style={{ color: "var(--text-muted)" }}>
                <TokenIcon symbol={r.coin} size={14} />
                <span className="truncate">
                  {r.coin} · {r.chain}
                </span>
              </span>
              <span className="mono font-semibold shrink-0" style={{ color: r.direction === "in" ? LONG : SHORT }}>
                {r.usd == null ? "unpriced" : `${r.direction === "in" ? "+" : "−"}${usd(r.usd)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Activity({ t }: { t: TraderProfile }) {
  const a = t.activity;
  if (!a)
    return (
      <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>
        No trades recorded by the live collector in the last 30 days.
      </p>
    );
  const slots = a.days; // 30 day slots from the server
  const max = Math.max(...slots.map((d) => d.volume), 1);
  const total = a.markets.reduce((s, m) => s + m.volume, 0) || 1;
  const palette = ["var(--text)", "var(--tier-active)", "var(--tier-niche)", "var(--green)", "var(--red)", "var(--text-faint)"];
  return (
    <div>
      <div className="flex items-end gap-[3px] h-20" aria-label="Volume per day">
        {slots.map((d) => (
          <span
            key={d.date}
            className="flex-1 rounded-[3px]"
            title={`${d.date}: ${d.volume ? usd(d.volume) : "no trades"}`}
            style={{ height: d.volume ? `${Math.max(6, (d.volume / max) * 100)}%` : "3px", background: d.volume ? "var(--text)" : "var(--border)" }}
          />
        ))}
      </div>
      <div className="mt-4">
        <SplitBar
          parts={a.markets.map((m, i) => ({
            label: m.market.replace("-USD", ""),
            value: m.volume,
            color: palette[i % palette.length],
            note: pct(m.volume / total, 0),
          }))}
        />
      </div>
      <p className="mt-3 text-[11.5px]" style={{ color: "var(--text-faint)" }}>
        {count(a.fills)} fills{a.makerShare != null ? ` · ${pct(a.makerShare, 0)} as maker` : ""}
      </p>
    </div>
  );
}

/** The bot's username, e.g. SodexTrackerBot. Alerts stay "coming soon" until it's set. */
const BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT ?? "";

function AlertButton({ name }: { name: string }) {
  if (!BOT) {
    return (
      <span
        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-[12.5px] font-medium"
        style={{ border: "1px dashed var(--border)", color: "var(--text-faint)" }}
        title="Telegram alerts are coming soon"
      >
        <Bell size={14} /> Alerts coming soon
      </span>
    );
  }
  return (
    <a
      href={`https://t.me/${BOT}?start=${encodeURIComponent(name)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-[12.5px] font-semibold"
      style={{ background: "var(--text)", color: "var(--bg)" }}
    >
      <Bell size={14} /> Get alerts on Telegram
    </a>
  );
}

export function TraderView({ name }: { name: string }) {
  const { data, error } = useApi<TraderResult>(`/api/analytics/trader/${encodeURIComponent(name)}`, 30_000, 60_000);

  const back = (
    <Link href="/analytics/rankings" className="mt-6 inline-flex items-center gap-1.5 text-[12.5px] hover:underline" style={{ color: "var(--text-muted)" }}>
      <ArrowLeft size={13} /> Rankings
    </Link>
  );
  if (error && !data)
    return (
      <>
        {back}
        <p className="mt-6 text-[13px]" style={{ color: "var(--red)" }}>
          {error}
        </p>
      </>
    );
  if (!data)
    return (
      <>
        {back}
        <TileSkeleton count={4} />
      </>
    );
  if (!data.available)
    return (
      <>
        {back}
        <p className="mt-6 text-[14px]" style={{ color: "var(--text-muted)" }}>
          {data.reason}
        </p>
      </>
    );

  const t = data;
  const bias = t.totals.notional ? (t.totals.longUsd - t.totals.shortUsd) / t.totals.notional : null;
  return (
    <div>
      {back}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-[26px] sm:text-[32px] font-bold tracking-tight leading-none" style={{ color: "var(--text)", letterSpacing: "-0.02em" }}>
          {t.name}
        </h2>
        <div className="flex flex-wrap gap-1.5 flex-1">
          {t.groups.size && <Badge>{t.groups.size}</Badge>}
          {t.groups.record && <Badge>{t.groups.record}</Badge>}
          {t.groups.live && <Badge>{t.groups.live}</Badge>}
        </div>
        <AlertButton name={t.name} />
      </div>
      <p className="mt-2 text-[12px]" style={{ color: "var(--text-faint)" }}>
        {t.positionsAt ? `Positions read ${when(t.positionsAt)} UTC, valued at live prices.` : "Positions not read yet."}
      </p>

      <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          label="Equity"
          value={t.equity == null ? "—" : usd(t.equity)}
          caption={t.totals.exposure == null ? "Account value" : `Exposure ${t.totals.exposure.toFixed(1)}×`}
        />
        <Kpi label="Open positions" value={usd(t.totals.notional)} caption={`${t.positions.length} position${t.positions.length === 1 ? "" : "s"}`}>
          {t.totals.notional > 0 && (
            <SplitBar
              legend={false}
              parts={[
                { label: "Long", value: t.totals.longUsd, color: LONG },
                { label: "Short", value: t.totals.shortUsd, color: SHORT },
              ]}
            />
          )}
        </Kpi>
        <Kpi label="Unrealised PnL" value={signedUsd(t.totals.upnl)} caption={bias == null ? "No open positions" : <BiasTag bias={bias} />} />
        <Kpi
          label="All-time PnL"
          value={t.alltimePnl == null ? "—" : signedUsd(t.alltimePnl)}
          caption={t.alltimeVolume ? `${usd(t.alltimeVolume)} traded` : "From SoDEX's leaderboard"}
        />
      </div>

      <div className="mt-4">
        <Panel title="Open positions">
          <Positions t={t} />
        </Panel>
      </div>
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Money in and out">
          <Money t={t} />
        </Panel>
        <Panel title="Trading · last 30 days">
          <Activity t={t} />
        </Panel>
      </div>
      <p className="mt-4 text-[11px] max-w-3xl" style={{ color: "var(--text-faint)" }}>
        Deposit and withdrawal amounts are rounded to two figures and times to the hour.
      </p>
    </div>
  );
}
