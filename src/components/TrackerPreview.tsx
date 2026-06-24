"use client";

const TOP_PAIRS = [
  { rank: 1, pair: "BTC-PERP", price: "$66,845.5", change: "+2.31%", volume: "$2.45M", pct: "18.4%" },
  { rank: 2, pair: "ETH-PERP", price: "$3,142.8", change: "+7.36%", volume: "$1.98M", pct: "15.7%" },
  { rank: 3, pair: "GOLD-PERP", price: "$2,340.8", change: "+1.23%", volume: "$1.25M", pct: "9.7%" },
  { rank: 4, pair: "OIL-PERP", price: "$78.64", change: "+6.72%", volume: "$0.92M", pct: "7.2%" },
  { rank: 5, pair: "SPX-PERP", price: "$6,312.1", change: "+3.31%", volume: "$0.71M", pct: "5.6%" },
];

const LEADERBOARD = [
  { rank: 1, addr: "7xKX…gAsU", pnl: "+$84,210", winRate: "78%" },
  { rank: 2, addr: "EPjF…t1v", pnl: "+$61,504", winRate: "71%" },
  { rank: 3, addr: "So11…1112", pnl: "+$47,320", winRate: "68%" },
  { rank: 4, addr: "3kNf…mW7Z", pnl: "+$39,880", winRate: "65%" },
];

function MiniSparkline({ up }: { up: boolean }) {
  const points = up
    ? "0,12 8,10 16,8 24,9 32,6 40,4 48,5 56,3 64,2"
    : "0,2 8,5 16,4 24,7 32,6 40,9 48,8 56,10 64,12";
  return (
    <svg width="64" height="14" viewBox="0 0 64 14" fill="none">
      <polyline
        points={points}
        stroke={up ? "var(--color-up)" : "var(--color-down)"}
        strokeWidth="1.5"
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function TrackerPreview() {
  return (
    <section id="dashboard" className="py-28" style={{ background: "var(--bg-surface)" }}>
      <div className="max-w-[1200px] mx-auto px-5">
        {/* Header */}
        <div className="mb-14">
          <div className="text-xs mono tracking-widest mb-3" style={{ color: "var(--accent)" }}>
            /02 — TRACKER PREVIEW
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
            Your data, live.
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-px" style={{ background: "var(--border)" }}>
          {/* Left: Overview + Top Pairs */}
          <div className="lg:col-span-2 flex flex-col gap-px" style={{ background: "var(--border)" }}>
            {/* Market Overview */}
            <div className="p-6" style={{ background: "var(--bg)" }}>
              <div className="flex items-center justify-between mb-5">
                <span className="text-xs mono tracking-wider" style={{ color: "var(--text-muted)" }}>
                  MARKET OVERVIEW
                </span>
                <div className="flex gap-1">
                  {["1H", "24H", "7D", "30D"].map((t) => (
                    <button
                      key={t}
                      className="px-2 py-0.5 text-[10px] mono rounded-sm transition-colors"
                      style={
                        t === "24H"
                          ? { background: "var(--accent)", color: "var(--accent-fg)" }
                          : { color: "var(--text-muted)", border: "1px solid var(--border)" }
                      }
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                {[
                  { label: "24H VOLUME", val: "$12.64M", delta: "+18.27%" },
                  { label: "ACTIVE PAIRS", val: "142", delta: "+8" },
                  { label: "SPCX TOURNAMENT", val: "$8.23M", delta: "+24.31%" },
                  { label: "TRADERS (24H)", val: "6,521", delta: "+12.68%" },
                ].map((s) => (
                  <div key={s.label}>
                    <div className="text-[9px] mono tracking-wider mb-1" style={{ color: "var(--text-faint)" }}>
                      {s.label}
                    </div>
                    <div className="text-lg font-bold mono" style={{ color: "var(--text)" }}>
                      {s.val}
                    </div>
                    <div className="text-xs mono" style={{ color: "var(--color-up)" }}>
                      {s.delta}
                    </div>
                  </div>
                ))}
              </div>

              {/* Fake chart */}
              <div
                className="w-full h-[100px] rounded-sm relative overflow-hidden"
                style={{ background: "var(--bg-elevated)" }}
              >
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 100" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0,80 L20,72 L40,65 L60,70 L80,55 L100,48 L120,52 L140,42 L160,38 L180,45 L200,32 L220,28 L240,35 L260,22 L280,18 L300,25 L320,15 L340,20 L360,12 L380,8 L400,14"
                    fill="url(#chartGrad)"
                    stroke="var(--accent)"
                    strokeWidth="1.5"
                  />
                </svg>
                {/* Y labels */}
                <div className="absolute left-2 top-2 text-[9px] mono" style={{ color: "var(--text-faint)" }}>$1.5M</div>
                <div className="absolute left-2 bottom-2 text-[9px] mono" style={{ color: "var(--text-faint)" }}>$0</div>
              </div>
            </div>

            {/* Top Pairs table */}
            <div className="p-6" style={{ background: "var(--bg)" }}>
              <div className="text-xs mono tracking-wider mb-4" style={{ color: "var(--text-muted)" }}>
                TOP PAIRS
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: "var(--text-faint)" }}>
                    <th className="mono text-left pb-2 font-normal">#</th>
                    <th className="mono text-left pb-2 font-normal">PAIR</th>
                    <th className="mono text-right pb-2 font-normal">PRICE</th>
                    <th className="mono text-right pb-2 font-normal hidden sm:table-cell">24H CHG</th>
                    <th className="mono text-right pb-2 font-normal hidden md:table-cell">VOLUME</th>
                    <th className="mono text-right pb-2 font-normal hidden lg:table-cell">VOL %</th>
                    <th className="pb-2 hidden sm:table-cell"></th>
                  </tr>
                </thead>
                <tbody>
                  {TOP_PAIRS.map((p) => (
                    <tr
                      key={p.rank}
                      className="border-t transition-colors cursor-pointer"
                      style={{ borderColor: "var(--border-subtle)" }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "")}
                    >
                      <td className="py-2.5 mono pr-3" style={{ color: "var(--text-faint)" }}>{p.rank}</td>
                      <td className="py-2.5 mono font-bold" style={{ color: "var(--text)" }}>{p.pair}</td>
                      <td className="py-2.5 mono text-right" style={{ color: "var(--text)" }}>{p.price}</td>
                      <td className="py-2.5 mono text-right hidden sm:table-cell" style={{ color: "var(--color-up)" }}>{p.change}</td>
                      <td className="py-2.5 mono text-right hidden md:table-cell" style={{ color: "var(--text-muted)" }}>{p.volume}</td>
                      <td className="py-2.5 mono text-right hidden lg:table-cell" style={{ color: "var(--text-muted)" }}>{p.pct}</td>
                      <td className="py-2.5 hidden sm:table-cell pl-3">
                        <MiniSparkline up={p.change.startsWith("+")} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right panel */}
          <div className="flex flex-col gap-px" style={{ background: "var(--border)" }}>
            {/* Tournament */}
            <div className="p-6" style={{ background: "var(--bg)" }}>
              <div className="text-xs mono tracking-wider mb-5" style={{ color: "var(--text-muted)" }}>
                SPCX TOURNAMENT
              </div>

              {/* Donut */}
              <div className="flex justify-center mb-5">
                <div className="relative w-[110px] h-[110px]">
                  <svg viewBox="0 0 110 110" className="w-full h-full -rotate-90">
                    <circle cx="55" cy="55" r="42" fill="none" stroke="var(--border)" strokeWidth="10" />
                    <circle
                      cx="55" cy="55" r="42"
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="10"
                      strokeDasharray={`${2 * Math.PI * 42 * 0.687} ${2 * Math.PI * 42 * 0.313}`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-bold mono" style={{ color: "var(--text)" }}>68.7%</span>
                  </div>
                </div>
              </div>

              <div className="text-center mb-5">
                <div className="text-lg font-bold mono" style={{ color: "var(--text)" }}>$8.23M</div>
                <div className="text-xs mono" style={{ color: "var(--text-muted)" }}>/ $12.00M goal</div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-5">
                {[{ label: "PARTICIPANTS", val: "12,842" }, { label: "TIME LEFT", val: "6D 14H" }].map((s) => (
                  <div key={s.label} className="p-3 rounded-sm" style={{ background: "var(--bg-surface)" }}>
                    <div className="text-[9px] mono tracking-wider mb-1" style={{ color: "var(--text-faint)" }}>{s.label}</div>
                    <div className="text-sm font-bold mono" style={{ color: "var(--text)" }}>{s.val}</div>
                  </div>
                ))}
              </div>

              <button
                className="w-full flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold rounded-sm transition-opacity hover:opacity-80"
                style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
              >
                View Tournament →
              </button>
            </div>

            {/* Leaderboard */}
            <div className="p-6 flex-1" style={{ background: "var(--bg)" }}>
              <div className="text-xs mono tracking-wider mb-4" style={{ color: "var(--text-muted)" }}>
                LEADERBOARD
              </div>
              <div className="flex flex-col gap-3">
                {LEADERBOARD.map((t) => (
                  <div
                    key={t.rank}
                    className="flex items-center justify-between py-2 border-b"
                    style={{ borderColor: "var(--border-subtle)" }}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="text-[10px] mono w-5 h-5 flex items-center justify-center rounded-sm font-bold"
                        style={
                          t.rank === 1
                            ? { background: "var(--accent)", color: "var(--accent-fg)" }
                            : { color: "var(--text-faint)" }
                        }
                      >
                        {t.rank}
                      </span>
                      <span className="text-xs mono" style={{ color: "var(--text-muted)" }}>{t.addr}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-xs mono font-bold" style={{ color: "var(--color-up)" }}>{t.pnl}</div>
                      <div className="text-[9px] mono" style={{ color: "var(--text-faint)" }}>{t.winRate} win</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
