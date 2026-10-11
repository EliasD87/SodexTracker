"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usd } from "@/lib/analyticsFormat";
import { useCompact } from "@/components/analytics/hooks";
import { useWidth } from "@/components/deep/shared";
import { Identicon } from "@/components/wallet/ui";
import { edgeOf, type Row } from "@/components/leaderboard/data";
import { edgeText, MEDAL, short, signed, toneOf, trackHref } from "@/components/leaderboard/parts";

/**
 * The field: the top hundred as dots, volume across (log scale), PnL up and
 * down (a log scale either side of zero). Where a dot sits says how it got
 * there: far up and left is a lot made on little trading, far right is
 * trading hard. Wallets that didn't trade at all in the window (their PnL
 * came from positions already held) get their own lane on the left. Dots
 * are bigger the higher they rank; the podium wears its medals. Hover for
 * figures, click to open the wallet.
 */

const PAD = { l: 52, r: 14, t: 16, b: 30 };
const symlog = (v: number) => Math.sign(v) * Math.log10(1 + Math.abs(v) / 100);
const VOL_TICKS = [1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9];
const PNL_TICKS = [-1e6, -1e5, -1e4, -1e3, 0, 1e3, 1e4, 1e5, 1e6, 1e7];

export function Field({ rows, focus }: { rows: Row[]; focus?: string | null }) {
  const router = useRouter();
  const compact = useCompact();
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<Row | null>(null);
  const H = compact ? 280 : 380;
  if (!rows.length) return <div ref={ref} style={{ height: H }} />;
  const pts = rows.filter((r) => r.volume > 0);
  const idle = rows.length - pts.length;

  // The no-trades lane, left of the plot, only when someone needs it.
  const LANE = idle ? (compact ? 44 : 64) : 0;
  const left = PAD.l + (LANE ? LANE + 10 : 0);
  const lx = pts.map((r) => Math.log10(r.volume));
  const ly = rows.map((r) => symlog(r.pnl));
  const x0 = lx.length ? Math.floor(Math.min(...lx) * 2) / 2 : 3;
  const x1 = lx.length ? Math.max(x0 + 1, Math.ceil(Math.max(...lx) * 2) / 2) : 6;
  const y0 = Math.min(0, Math.floor(Math.min(...ly) * 2) / 2);
  const y1 = Math.max(0.5, Math.ceil(Math.max(...ly) * 2) / 2);
  const X = (v: number) => left + ((Math.log10(Math.max(v, 1)) - x0) / (x1 - x0 || 1)) * (width - left - PAD.r);
  const Y = (v: number) => PAD.t + (1 - (symlog(v) - y0) / (y1 - y0 || 1)) * (H - PAD.t - PAD.b);
  // Spread across the lane by rank, the same way every time.
  const at = (r: Row): [number, number] =>
    r.volume > 0 ? [X(r.volume), Y(r.pnl)] : [PAD.l + LANE / 2 + (((r.rank * 37) % 100) / 100 - 0.5) * (LANE - 18), Y(r.pnl)];
  const medianVol = pts.length ? [...pts].sort((a, b) => a.volume - b.volume)[Math.floor(pts.length / 2)].volume : null;
  const radius = (r: Row) => (r.rank <= 3 ? 7.5 : 2.5 + 3.5 * (1 - Math.min(r.rank, 100) / 100));

  const near = (mx: number, my: number) => {
    let best: Row | null = null;
    let d = 22 * 22;
    for (const r of rows) {
      const [px, py] = at(r);
      const dx = px - mx;
      const dy = py - my;
      if (dx * dx + dy * dy < d) {
        d = dx * dx + dy * dy;
        best = r;
      }
    }
    return best;
  };
  const corner = "absolute text-[10.5px] font-semibold uppercase tracking-[0.08em] pointer-events-none";

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height: H }}>
      {width > 0 && (
        <>
          <svg
            width={width}
            height={H}
            className="block"
            role="img"
            aria-label="The top hundred by PnL and volume"
            style={{ cursor: hover ? "pointer" : "default" }}
            onMouseMove={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              setHover(near(e.clientX - box.left, e.clientY - box.top));
            }}
            onMouseLeave={() => setHover(null)}
            onClick={() => hover && router.push(trackHref(hover.address))}
          >
            {/* Grid */}
            {VOL_TICKS.filter((t) => Math.log10(t) >= x0 && Math.log10(t) <= x1).map((t) => (
              <g key={`x${t}`}>
                <line x1={X(t)} x2={X(t)} y1={PAD.t} y2={H - PAD.b} stroke="var(--chart-grid)" />
                <text x={X(t)} y={H - 10} textAnchor="middle" fontSize={10} className="mono" fill="var(--text-faint)">
                  {usd(t, 0)}
                </text>
              </g>
            ))}
            {PNL_TICKS.filter((t) => symlog(t) >= y0 && symlog(t) <= y1).map((t) => (
              <g key={`y${t}`}>
                <line
                  x1={PAD.l}
                  x2={width - PAD.r}
                  y1={Y(t)}
                  y2={Y(t)}
                  stroke={t === 0 ? "var(--text-faint)" : "var(--chart-grid)"}
                  strokeDasharray={t === 0 ? "3 3" : undefined}
                />
                <text x={PAD.l - 8} y={Y(t) + 3} textAnchor="end" fontSize={10} className="mono" fill="var(--text-faint)">
                  {t === 0 ? "$0" : signed(t).replace(".0", "")}
                </text>
              </g>
            ))}
            {/* The no-trades lane */}
            {LANE > 0 && (
              <g>
                <rect x={PAD.l} y={PAD.t} width={LANE} height={H - PAD.t - PAD.b} rx={8} fill="var(--bg-elevated)" opacity={0.7} />
                <text x={PAD.l + LANE / 2} y={H - 10} textAnchor="middle" fontSize={10} fill="var(--text-faint)">
                  No trades
                </text>
              </g>
            )}
            {/* Median volume: left of it, trading lighter than most of the top hundred. */}
            {medianVol != null && (
              <line x1={X(medianVol)} x2={X(medianVol)} y1={PAD.t} y2={H - PAD.b} stroke="var(--text-faint)" strokeDasharray="2 4" opacity={0.6} />
            )}

            {/* Dots, the lowest ranks first so the podium sits on top. */}
            {[...rows]
              .sort((a, b) => b.rank - a.rank)
              .map((r) => {
                const medal = MEDAL[r.rank];
                const on = hover?.address === r.address || focus === r.address;
                const [cx, cy] = at(r);
                return (
                  <g key={r.address} className="lb-dot" style={{ animationDelay: `${Math.min(r.rank, 100) * 6}ms` }}>
                    {on && <circle cx={cx} cy={cy} r={radius(r) + 5} fill="none" stroke="var(--text)" strokeWidth={1.2} />}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={radius(r)}
                      fill={medal ?? toneOf(r.pnl)}
                      fillOpacity={medal ? 1 : 0.55}
                      stroke={medal ? "var(--bg-surface)" : toneOf(r.pnl)}
                      strokeWidth={medal ? 2 : 1}
                    />
                    {medal && (
                      <text x={cx} y={cy - 12} textAnchor="middle" fontSize={10.5} fontWeight={800} fill={medal}>
                        #{r.rank}
                      </text>
                    )}
                  </g>
                );
              })}
          </svg>

          <span className={corner} style={{ left: left + 8, top: PAD.t + 4, color: "var(--text-faint)" }}>
            Sharp · made a lot on light volume
          </span>
          <span className={`${corner} text-right`} style={{ right: PAD.r + 8, top: PAD.t + 4, color: "var(--text-faint)" }}>
            Heavy hitters
          </span>
          {y0 < 0 && (
            <span className={`${corner} text-right`} style={{ right: PAD.r + 8, bottom: PAD.b + 6, color: "var(--text-faint)" }}>
              Paying to play
            </span>
          )}

          {hover && (
            <div
              role="tooltip"
              className="pointer-events-none absolute z-20 w-[210px] px-3 py-2.5 text-[12px]"
              style={{
                left: Math.max(0, Math.min(at(hover)[0] + 14, width - 218)),
                top: Math.max(0, Math.min(at(hover)[1] + 14, H - 120)),
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                boxShadow: "0 12px 32px rgba(0,0,0,0.3)",
              }}
            >
              <div className="flex items-center gap-2">
                <Identicon address={hover.address} size={22} />
                <span className="mono font-semibold" style={{ color: "var(--text)" }}>
                  {short(hover.address)}
                </span>
                <span className="ml-auto mono text-[11px] font-bold" style={{ color: MEDAL[hover.rank] ?? "var(--text-muted)" }}>
                  #{hover.rank}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1 text-[10.5px]" style={{ color: "var(--text-faint)" }}>
                <span>
                  PnL
                  <span className="block mono text-[12px]" style={{ color: toneOf(hover.pnl) }}>
                    {signed(hover.pnl)}
                  </span>
                </span>
                <span>
                  Volume
                  <span className="block mono text-[12px]" style={{ color: "var(--text)" }}>
                    {usd(hover.volume)}
                  </span>
                </span>
                <span>
                  Edge
                  <span className="block mono text-[12px]" style={{ color: "var(--text)" }}>
                    {edgeText(edgeOf(hover))}
                  </span>
                </span>
              </div>
              <div className="mt-2 text-[10.5px]" style={{ color: "var(--text-faint)" }}>
                Click to open in Tracker
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
