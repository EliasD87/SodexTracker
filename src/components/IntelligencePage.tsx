"use client";

import { useEffect, useState } from "react";
import { X, ExternalLink, TrendingUp, ScanSearch, ArrowRight } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { cachedApiFetch } from "@/lib/fetchCache";
import { IndexDonut, sliceColor } from "@/components/IndexDonut";
import { TokenIcon } from "@/components/TokenIcon";
import { prettyIndexName, sectorIcon } from "@/lib/indexMeta";
import { LookThroughModal } from "@/components/LookThroughModal";
import { FlowDivergenceSection } from "@/components/FlowDivergenceSection";
import { PairIntelligence } from "@/components/PairIntelligence";

/* ───────────────────────────── Types ───────────────────────────── */
interface IndexSnapshot {
  price: number;
  change_pct_24h: number;
  roi_7d: number;
  roi_1m: number;
  roi_3m: number;
  roi_1y: number;
  ytd: number;
}
interface OverviewItem {
  ticker: string;
  tradeableOnSodex: boolean;
  snapshot: IndexSnapshot | null;
}
interface Constituent {
  currencyId: string;
  ticker: string;
  name: string;
  weight: number;
  icon: string | null;
  price: number | null;
  change24h: number | null; // fraction
  contribution: number | null; // weight * change24h
}
interface XrayData {
  ticker: string;
  snapshot: IndexSnapshot;
  constituents: Constituent[];
}

/* ─────────────────────────── Formatting ─────────────────────────── */
const prettyName = prettyIndexName;

/* SoSoValue index values are LEVELS (points, normalized at inception), not the
 * USD price of the tokenized product SoDEX trades — never render with "$". */
const fmtLevel = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (n: number) => (n >= 0 ? "+" : "") + (n * 100).toFixed(2) + "%";
const tone = (n: number) => (n > 0 ? "var(--green)" : n < 0 ? "var(--red)" : "var(--text-muted)");
const fmtTokenPrice = (n: number) =>
  n >= 1000
    ? "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : n >= 1
      ? "$" + n.toFixed(2)
      : "$" + n.toFixed(4);

/** Constituent that moved the index most today (by |weight × 24h move|). */
function topDriver(cs: Constituent[]): Constituent | null {
  const withC = cs.filter((c) => c.contribution != null);
  if (!withC.length) return null;
  return withC.reduce((a, b) => (Math.abs(b.contribution!) > Math.abs(a.contribution!) ? b : a));
}

/* ──────────────────────────── ROI ladder ───────────────────────── */
const ROI_KEYS: [keyof IndexSnapshot, string][] = [
  ["roi_7d", "7D"],
  ["roi_1m", "1M"],
  ["roi_3m", "3M"],
  ["roi_1y", "1Y"],
  ["ytd", "YTD"],
];

function RoiLadder({ s, compact = false }: { s: IndexSnapshot; compact?: boolean }) {
  return (
    <div className="grid grid-cols-5 gap-1">
      {ROI_KEYS.map(([k, label]) => (
        <div
          key={label}
          className="flex flex-col items-center rounded-md py-1"
          style={{ background: "var(--bg-elevated)" }}
        >
          <span className="text-[8.5px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
            {label}
          </span>
          <span
            className={`${compact ? "text-[10px]" : "text-[11px]"} font-semibold tabular-nums mt-0.5`}
            style={{ color: tone(s[k] as number) }}
          >
            {fmtPct(s[k] as number)}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────── Index card ────────────────────────── */
function IndexCard({ item, onOpen }: { item: OverviewItem; onOpen: () => void }) {
  const s = item.snapshot;
  const Icon = sectorIcon(item.ticker);
  return (
    <button
      onClick={onOpen}
      className="text-left rounded-[14px] p-4 transition-all group"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--bg-elevated)";
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.borderColor = "var(--accent)";
        e.currentTarget.style.boxShadow = "0 6px 20px rgba(124,107,240,0.10)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--bg-surface)";
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.boxShadow = "none";
      }}
      aria-label={`Open ${prettyName(item.ticker)} X-ray`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="flex items-center justify-center shrink-0 rounded-lg"
            style={{ width: 30, height: 30, background: "rgba(124,107,240,0.12)" }}
          >
            <Icon size={15} style={{ color: "#7C6BF0" }} />
          </span>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold truncate" style={{ color: "var(--text)" }}>
              {prettyName(item.ticker)}
            </div>
            <div className="text-[10px] font-medium" style={{ color: "var(--text-faint)" }}>
              SoSoValue Index
            </div>
          </div>
        </div>
        {item.tradeableOnSodex && (
          <span
            className="text-[8.5px] font-bold px-1.5 py-0.5 rounded leading-none shrink-0"
            style={{ background: "var(--green-tint)", color: "var(--green)", letterSpacing: "0.03em" }}
          >
            ON SODEX
          </span>
        )}
      </div>

      {s ? (
        <>
          <div className="flex items-baseline justify-between mb-3">
            <span className="text-[22px] font-semibold tracking-tight tabular-nums" style={{ color: "var(--text)" }}>
              {fmtLevel(s.price)}
              <span className="text-[10px] font-medium ml-1" style={{ color: "var(--text-faint)" }}>pts</span>
            </span>
            <span className="text-[12px] font-semibold tabular-nums" style={{ color: tone(s.change_pct_24h) }}>
              {fmtPct(s.change_pct_24h)}
            </span>
          </div>
          <RoiLadder s={s} />
        </>
      ) : (
        <div className="text-[12px] py-4" style={{ color: "var(--text-faint)" }}>
          Snapshot unavailable
        </div>
      )}

      {/* click affordance — always visible, brightens on hover */}
      <div
        className="flex items-center justify-between mt-3 pt-2.5 transition-colors"
        style={{ borderTop: "1px solid var(--border-subtle)" }}
      >
        <span className="flex items-center gap-1.5 text-[10px] font-semibold transition-colors text-[color:var(--text-faint)] group-hover:text-[color:var(--accent)]">
          <ScanSearch size={12} />
          View X-ray · composition &amp; drivers
        </span>
        <ArrowRight
          size={13}
          className="transition-all text-[color:var(--text-faint)] group-hover:text-[color:var(--accent)] group-hover:translate-x-0.5"
        />
      </div>
    </button>
  );
}

/* ─────────────────────────── X-ray modal ───────────────────────── */
function XrayModal({ ticker, onClose }: { ticker: string; onClose: () => void }) {
  const [data, setData] = useState<XrayData | null>(null);
  const [error, setError] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(false);
    setHovered(null);
    cachedApiFetch<XrayData>(`/api/sosovalue/indices/${ticker}`)
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [ticker]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }} onClick={onClose}>
      <div
        className="relative w-full max-w-[560px] max-h-[88vh] overflow-y-auto rounded-2xl"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,0.4)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="sticky top-0 flex items-center justify-between px-5 py-4 z-10" style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center rounded-lg" style={{ width: 32, height: 32, background: "rgba(124,107,240,0.12)" }}>
              {(() => {
                const Icon = sectorIcon(ticker);
                return <Icon size={16} style={{ color: "#7C6BF0" }} />;
              })()}
            </span>
            <div>
              <div className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
                {prettyName(ticker)} <span style={{ color: "var(--text-faint)" }}>Index</span>
              </div>
              <div className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "#7C6BF0" }}>
                Inside the index · SoSoValue
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          {error ? (
            <div className="py-16 text-center text-[13px]" style={{ color: "var(--text-faint)" }}>
              Couldn’t load this index right now.
            </div>
          ) : !data ? (
            <div className="py-16 flex items-center justify-center">
              <div className="w-6 h-6 rounded-full animate-spin" style={{ border: "2px solid var(--border)", borderTopColor: "#7C6BF0" }} />
            </div>
          ) : (
            <>
              {/* index level + roi */}
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-[30px] font-semibold tracking-tight tabular-nums" style={{ color: "var(--text)" }}>
                  {fmtLevel(data.snapshot.price)}
                  <span className="text-[12px] font-medium ml-1.5" style={{ color: "var(--text-faint)" }}>index level</span>
                </span>
                <span className="text-[14px] font-semibold tabular-nums" style={{ color: tone(data.snapshot.change_pct_24h) }}>
                  {fmtPct(data.snapshot.change_pct_24h)} · 24h
                </span>
              </div>
              <div className="mb-5">
                <RoiLadder s={data.snapshot} />
              </div>

              {/* constituents header + today's driver */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp size={13} style={{ color: "var(--text-faint)" }} />
                  <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
                    {data.constituents.length} Constituents · Weighted
                  </span>
                </div>
                {(() => {
                  const d = topDriver(data.constituents);
                  if (!d || d.contribution == null) return null;
                  return (
                    <span className="text-[10px] font-medium" style={{ color: "var(--text-faint)" }}>
                      Top 24h driver:{" "}
                      <b style={{ color: "var(--text)" }}>{d.ticker}</b>{" "}
                      <span className="tabular-nums" style={{ color: tone(d.contribution) }}>{fmtPct(d.contribution)}</span>
                    </span>
                  );
                })()}
              </div>

              {/* donut — hover a slice or a legend row to inspect it */}
              <div className="flex justify-center mb-4">
                <IndexDonut
                  slices={data.constituents.map((c) => ({ key: c.currencyId, weight: c.weight }))}
                  hovered={hovered}
                  onHover={setHovered}
                  center={
                    hovered != null && data.constituents[hovered] ? (
                      <>
                        <TokenIcon symbol={data.constituents[hovered].ticker} size={24} />
                        <span className="text-[12.5px] font-semibold mt-1" style={{ color: "var(--text)" }}>
                          {data.constituents[hovered].ticker}
                        </span>
                        <span className="text-[17px] font-semibold tabular-nums leading-tight" style={{ color: "var(--text)" }}>
                          {(data.constituents[hovered].weight * 100).toFixed(2)}%
                        </span>
                        {data.constituents[hovered].change24h != null && (
                          <span className="mono text-[10px] font-semibold" style={{ color: tone(data.constituents[hovered].change24h!) }}>
                            {fmtPct(data.constituents[hovered].change24h!)} · 24h
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="text-[23px] font-semibold tracking-tight tabular-nums" style={{ color: "var(--text)" }}>
                          {data.constituents.length}
                        </span>
                        <span className="tag mt-0.5" style={{ color: "var(--text-faint)" }}>
                          Assets
                        </span>
                      </>
                    )
                  }
                />
              </div>

              {/* legend — icon, price, 24h move, weight (syncs with donut hover; SoSoValue data, ~12h refresh) */}
              <div className="flex flex-col gap-0.5">
                {data.constituents.map((c, i) => {
                  const active = hovered === i;
                  const recede = hovered != null && !active;
                  return (
                    <div
                      key={c.currencyId}
                      className="flex items-center gap-2.5 py-1 px-2 -mx-2 rounded-lg"
                      onMouseEnter={() => setHovered(i)}
                      onMouseLeave={() => setHovered(null)}
                      style={{
                        background: active ? "var(--bg-elevated)" : "transparent",
                        opacity: recede ? 0.5 : 1,
                        transition: "background 0.15s ease, opacity 0.15s ease",
                      }}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: sliceColor(i, data.constituents.length) }} />
                      <TokenIcon symbol={c.ticker} size={18} />
                      <span className="text-[12.5px] font-semibold shrink-0 w-12" style={{ color: "var(--text)" }}>
                        {c.ticker}
                      </span>
                      <span className="mono text-[11px] shrink-0 w-16 text-right" style={{ color: "var(--text-muted)" }}>
                        {c.price != null ? fmtTokenPrice(c.price) : "—"}
                      </span>
                      <span className="mono text-[11px] font-semibold shrink-0 w-14 text-right" style={{ color: c.change24h != null ? tone(c.change24h) : "var(--text-faint)" }}>
                        {c.change24h != null ? fmtPct(c.change24h) : "—"}
                      </span>
                      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
                        <div className="h-full rounded-full" style={{ width: `${c.weight * 100}%`, background: sliceColor(i, data.constituents.length) }} />
                      </div>
                      <span className="mono text-[11.5px] font-semibold w-12 text-right shrink-0" style={{ color: "var(--text)" }}>
                        {(c.weight * 100).toFixed(2)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────── Look-through address bar ───────────────── */
function LookThroughBar({ onSubmit }: { onSubmit: (address: string) => void }) {
  const [value, setValue] = useState("");

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <div
      className="rounded-[14px] p-4 mb-8 flex flex-col sm:flex-row sm:items-center gap-3"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center gap-2.5 shrink-0">
        <span className="flex items-center justify-center rounded-lg shrink-0" style={{ width: 32, height: 32, background: "rgba(124,107,240,0.12)" }}>
          <ScanSearch size={16} style={{ color: "#7C6BF0" }} />
        </span>
        <div>
          <div className="text-[13px] font-semibold whitespace-nowrap" style={{ color: "var(--text)" }}>
            Index Look-Through
          </div>
          <div className="tag" style={{ color: "#7C6BF0" }}>
            See what any wallet's index tokens really hold
          </div>
        </div>
      </div>
      <div className="flex-1 flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Paste a wallet address…"
          className="mono flex-1 min-w-0 px-3 py-2 rounded-lg text-[12.5px] outline-none"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text)" }}
        />
        <button
          onClick={submit}
          disabled={!value.trim()}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12.5px] font-semibold shrink-0 transition-opacity"
          style={{
            background: "#7C6BF0",
            color: "#fff",
            opacity: value.trim() ? 1 : 0.4,
            cursor: value.trim() ? "pointer" : "default",
          }}
        >
          Look Through <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────── Page ──────────────────────────────── */
export function IntelligencePage() {
  const [items, setItems] = useState<OverviewItem[] | null>(null);
  const [error, setError] = useState(false);
  const [openTicker, setOpenTicker] = useState<string | null>(null);
  const [lookThroughAddress, setLookThroughAddress] = useState<string | null>(null);

  useEffect(() => {
    cachedApiFetch<OverviewItem[]>("/api/sosovalue/indices")
      .then(setItems)
      .catch(() => setError(true));
  }, []);

  const tradeableCount = items?.filter((i) => i.tradeableOnSodex).length ?? 0;

  return (
    <main>
      <Navbar />
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 pt-24 pb-24">
        {/* header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(124,107,240,0.14)", color: "#7C6BF0", letterSpacing: "0.05em" }}>
              SOSOVALUE
            </span>
            <span className="text-[11px] font-medium" style={{ color: "var(--text-faint)" }}>
              Powered by the SoSoValue index engine
            </span>
          </div>
          <h1 className="text-[28px] sm:text-[34px] font-semibold tracking-tight" style={{ color: "var(--text)" }}>
            Markets Intelligence
          </h1>
          <p className="text-[14px] mt-1.5 max-w-[560px]" style={{ color: "var(--text-muted)" }}>
            Every SoSoValue sector index, decomposed. See exactly what’s inside the tokenized
            indices you can trade on SoDEX — constituents, weights, and performance.
          </p>
          {items && (
            <div className="flex items-center gap-4 mt-4 text-[12px]" style={{ color: "var(--text-muted)" }}>
              <span>
                <b style={{ color: "var(--text)" }}>{items.length}</b> sector indices
              </span>
              <span className="w-px h-3" style={{ background: "var(--border)" }} />
              <span>
                <b style={{ color: "var(--green)" }}>{tradeableCount}</b> tradeable on SoDEX
              </span>
            </div>
          )}
        </div>

        <LookThroughBar onSubmit={setLookThroughAddress} />

        <FlowDivergenceSection />

        <PairIntelligence />

        {/* grid header hint */}
        <div className="flex items-center gap-2 mb-3">
          <ScanSearch size={14} style={{ color: "var(--text-muted)" }} />
          <span className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>Sector indices</span>
          <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
            — click any card to open its X-ray: constituents, weights &amp; 24h drivers
          </span>
        </div>

        {/* grid */}
        {error ? (
          <div className="py-24 text-center text-[14px]" style={{ color: "var(--text-faint)" }}>
            Couldn’t reach the SoSoValue index feed.
          </div>
        ) : !items ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="rounded-[14px] h-[178px] animate-pulse" style={{ background: "var(--bg-elevated)" }} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* tradeable first, then by 24h change desc */}
            {[...items]
              .sort((a, b) => {
                if (a.tradeableOnSodex !== b.tradeableOnSodex) return a.tradeableOnSodex ? -1 : 1;
                return (b.snapshot?.change_pct_24h ?? -Infinity) - (a.snapshot?.change_pct_24h ?? -Infinity);
              })
              .map((item) => (
                <IndexCard key={item.ticker} item={item} onOpen={() => setOpenTicker(item.ticker)} />
              ))}
          </div>
        )}

        {/* footnote */}
        <p className="text-[11px] mt-8 flex items-center gap-1.5" style={{ color: "var(--text-faint)" }}>
          <ExternalLink size={11} />
          Index data via SoSoValue OpenAPI. Constituents & weights update on rebalance.
        </p>
      </div>

      {openTicker && <XrayModal ticker={openTicker} onClose={() => setOpenTicker(null)} />}
      {lookThroughAddress && (
        <LookThroughModal address={lookThroughAddress} onClose={() => setLookThroughAddress(null)} />
      )}
    </main>
  );
}
