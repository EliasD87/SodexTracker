"use client";

import { useEffect, useState } from "react";
import {
  Bot,
  Download,
  FileCode2,
  Terminal,
  TrendingUp,
  Magnet,
  Waves,
  Grid3x3,
  Coins,
  Mountain,
  X,
  Server,
  Copy,
  Check,
  AlertTriangle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Navbar } from "@/components/Navbar";

/**
 * Trading Bots (beta) — six downloadable, single-file Python strategy bots.
 *
 * LOCAL-FIRST: the bots run on the user's machine (Python 3.10+, zero
 * dependencies) in PAPER mode — simulated fills against live SoDEX market
 * data, never touching keys. Hosted/server deployment is a later release.
 *
 * The performance figures on the cards are SIMULATED 90-day backtests with
 * fixed parameters and simplified fees — labelled as such everywhere. They
 * exist to describe each strategy's *shape* (win rate vs payoff profile),
 * not to promise returns.
 */

interface BotDef {
  slug: string;
  name: string;
  icon: LucideIcon;
  tag: string;
  desc: string;
  market: string;
  params: string[];
  perf: { ret: number; wr: number; pf: number; dd: number; trades: number };
  seed: number;
}

const BOTS: BotDef[] = [
  {
    slug: "momo-cross",
    name: "Momo Cross",
    icon: TrendingUp,
    tag: "TREND",
    desc: "Classic 9/21 EMA crossover, stop-and-reverse. Rides momentum; bleeds in chop, feasts in trends.",
    market: "BTC-USD · 15m",
    params: ["EMA 9/21", "5x lev", "2% risk"],
    perf: { ret: 14.2, wr: 41, pf: 1.38, dd: -9.8, trades: 87 },
    seed: 7,
  },
  {
    slug: "rubber-band",
    name: "Rubber Band",
    icon: Magnet,
    tag: "MEAN REVERSION",
    desc: "Wilder RSI-14 snap-back: buys fear under 30, sells greed over 70, exits at the midline.",
    market: "SOL-USD · 5m",
    params: ["RSI 14", "30/70 bands", "3x lev"],
    perf: { ret: 9.6, wr: 63, pf: 1.21, dd: -7.4, trades: 214 },
    seed: 21,
  },
  {
    slug: "squeeze-rider",
    name: "Squeeze Rider",
    icon: Waves,
    tag: "BREAKOUT",
    desc: "Waits for Bollinger band-width to compress into its tightest quartile, then trades the expansion.",
    market: "ETH-USD · 1h",
    params: ["BB 20/2.0", "25pctl squeeze", "4x lev"],
    perf: { ret: 18.9, wr: 44, pf: 1.52, dd: -12.1, trades: 41 },
    seed: 33,
  },
  {
    slug: "grid-weaver",
    name: "Grid Weaver",
    icon: Grid3x3,
    tag: "GRID",
    desc: "Symmetric 6×2 grid, 0.4% rungs. Monetises chop tick by tick; accumulates inventory in trends.",
    market: "XRP-USD · ticks",
    params: ["6 rungs/side", "0.4% step", "$250 lots"],
    perf: { ret: 7.8, wr: 71, pf: 1.18, dd: -14.6, trades: 612 },
    seed: 45,
  },
  {
    slug: "funding-farmer",
    name: "Funding Farmer",
    icon: Coins,
    tag: "CARRY",
    desc: "Scans every SoDEX perp for extreme funding and farms the payment against the crowded side.",
    market: "All perps · funding ticks",
    params: ["|rate| ≥ 0.03%", "3m hold", "$1k/farm"],
    perf: { ret: 6.4, wr: 68, pf: 1.44, dd: -3.9, trades: 96 },
    seed: 58,
  },
  {
    slug: "range-breaker",
    name: "Range Breaker",
    icon: Mountain,
    tag: "BREAKOUT",
    desc: "Turtle-style Donchian-20 breakout with a trailing 2×ATR stop. Loses small, lets winners run.",
    market: "HYPE-USD · 30m",
    params: ["Donchian 20", "2×ATR trail", "4x lev"],
    perf: { ret: 22.7, wr: 38, pf: 1.61, dd: -15.3, trades: 58 },
    seed: 64,
  },
];

/* Deterministic (SSR-safe) equity curve per bot: seeded LCG walk, scaled so
 * the endpoint matches the labelled simulated return. Illustration only. */
function equityCurve(seed: number, ret: number, dd: number): number[] {
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296 - 0.5;
  };
  const pts = [0];
  for (let i = 1; i < 48; i++) pts.push(pts[i - 1] + rand() * Math.abs(dd) * 0.55 + ret / 48);
  const end = pts[pts.length - 1] || 1;
  return pts.map((p) => (p * ret) / end);
}

function Spark({ curve, up }: { curve: number[]; up: boolean }) {
  const W = 260;
  const H = 40;
  const min = Math.min(...curve);
  const max = Math.max(...curve);
  const span = max - min || 1;
  const pts = curve.map((v, i) => `${(i / (curve.length - 1)) * W},${H - 3 - ((v - min) / span) * (H - 6)}`);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} aria-hidden>
      <polyline points={pts.join(" ")} fill="none" stroke={up ? "var(--green)" : "var(--red)"} strokeWidth={1.4} strokeLinejoin="round" opacity={0.85} />
    </svg>
  );
}

const tone = (n: number) => (n > 0 ? "var(--green)" : n < 0 ? "var(--red)" : "var(--text-muted)");

/* ── code viewer modal ── */
function CodeModal({ bot, onClose }: { bot: BotDef; onClose: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/bots/${bot.slug}.py`)
      .then((r) => r.text())
      .then((t) => alive && setCode(t))
      .catch(() => alive && setCode("# failed to load"));
    return () => {
      alive = false;
    };
  }, [bot.slug]);

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
      <div className="relative w-full max-w-[780px] max-h-[86vh] flex flex-col rounded-2xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,0.4)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-5 py-3.5 shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <FileCode2 size={16} style={{ color: "var(--text-muted)" }} />
          <span className="mono text-[13px] font-semibold" style={{ color: "var(--text)" }}>{bot.slug}.py</span>
          <span className="tag" style={{ color: "var(--text-faint)" }}>PYTHON 3.10+ · NO DEPENDENCIES · PAPER MODE</span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => {
                if (code) navigator.clipboard?.writeText(code).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold"
              style={{ background: "var(--bg-elevated)", color: "var(--text)" }}
            >
              {copied ? <Check size={12} style={{ color: "var(--green)" }} /> : <Copy size={12} />}
              {copied ? "copied" : "copy"}
            </button>
            <a href={`/bots/${bot.slug}.py`} download className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold" style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>
              <Download size={12} /> download
            </a>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }} aria-label="Close">
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="overflow-auto p-4" style={{ background: "var(--bg)" }}>
          {code === null ? (
            <div className="h-40 rounded-lg animate-pulse" style={{ background: "var(--bg-elevated)" }} />
          ) : (
            <pre className="mono text-[11px] leading-relaxed whitespace-pre" style={{ color: "var(--text-muted)" }}>{code}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════ page ═══════════════════════════════ */
export function TradingBotsPage() {
  const [viewing, setViewing] = useState<BotDef | null>(null);

  return (
    <main>
      <Navbar />

      {/* Coming-soon lock: the page is built but gated until launch. The content
          behind is fully rendered (so the design reads through the blur) but
          non-interactive. */}
      <div className="fixed inset-0 z-[90] flex items-center justify-center px-6" style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(7px)", WebkitBackdropFilter: "blur(7px)" }}>
        <div className="text-center max-w-[420px]">
          <span className="inline-flex items-center justify-center rounded-2xl mb-4" style={{ width: 56, height: 56, background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
            <Bot size={26} style={{ color: "var(--text)" }} />
          </span>
          <div className="tag mb-2 inline-block px-2 py-0.5 rounded" style={{ background: "var(--green-tint)", color: "var(--green)" }}>COMING SOON</div>
          <h2 className="text-[24px] font-semibold tracking-tight mb-2" style={{ color: "var(--text)" }}>Trading Bots</h2>
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Six downloadable Python strategy bots — trend, mean-reversion, breakout, grid, funding carry — are in final
            testing. They&apos;ll run locally in paper mode against live SoDEX data, with no keys and no dependencies.
            Dropping soon.
          </p>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 pt-24 pb-24 select-none" style={{ pointerEvents: "none" }} aria-hidden>
        {/* header */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="tag px-1.5 py-0.5 rounded" style={{ background: "var(--green-tint)", color: "var(--green)", letterSpacing: "0.05em" }}>BETA</span>
            <span className="text-[11px] font-medium" style={{ color: "var(--text-faint)" }}>Six known strategies, one file each — read every line before you run it.</span>
          </div>
          <h1 className="text-[28px] sm:text-[34px] font-semibold tracking-tight" style={{ color: "var(--text)" }}>Trading Bots</h1>
          <p className="text-[14px] mt-1.5 max-w-[640px]" style={{ color: "var(--text-muted)" }}>
            Downloadable Python bots that trade a simulated balance against live SoDEX market data.
            No accounts, no keys, no dependencies — download, run, watch it work.
          </p>
        </div>

        {/* local-first notice */}
        <div className="flex items-start gap-3 rounded-[14px] px-4 py-3.5 mb-6" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <Server size={16} style={{ color: "var(--text-muted)", marginTop: 2, flexShrink: 0 }} />
          <div className="text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            <b style={{ color: "var(--text)" }}>Local-first for now.</b> These bots deploy on <b>your machine</b> and run in{" "}
            <b>paper mode</b> — simulated fills, simulated balance, live SoDEX prices. Hosted server deployment
            (run 24/7 without your laptop) is planned for a later release, and live execution will only ever ship
            with explicit, per-order key control on your side.
          </div>
        </div>

        {/* bot grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
          {BOTS.map((b) => {
            const Icon = b.icon;
            const curve = equityCurve(b.seed, b.perf.ret, b.perf.dd);
            return (
              <div key={b.slug} className="rounded-[14px] p-4 flex flex-col" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                <div className="flex items-start gap-2.5 mb-2.5">
                  <span className="flex items-center justify-center rounded-lg shrink-0" style={{ width: 34, height: 34, background: "var(--bg-elevated)" }}>
                    <Icon size={16} style={{ color: "var(--text)" }} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[14.5px] font-semibold leading-tight" style={{ color: "var(--text)" }}>{b.name}</div>
                    <div className="tag mt-0.5" style={{ color: "var(--text-faint)" }}>{b.tag} · {b.market}</div>
                  </div>
                </div>

                <p className="text-[11.5px] leading-snug mb-3" style={{ color: "var(--text-muted)" }}>{b.desc}</p>

                <div className="flex items-center gap-1.5 flex-wrap mb-3">
                  {b.params.map((p) => (
                    <span key={p} className="mono text-[9px] px-1.5 py-0.5 rounded" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>{p}</span>
                  ))}
                </div>

                {/* simulated performance */}
                <div className="rounded-lg p-2.5 mb-3" style={{ background: "var(--bg-elevated)" }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="tag" style={{ color: "var(--text-faint)", fontSize: 8 }}>SIMULATED · 90D BACKTEST</span>
                    <span className="mono text-[12px] font-bold" style={{ color: tone(b.perf.ret) }}>{b.perf.ret >= 0 ? "+" : ""}{b.perf.ret.toFixed(1)}%</span>
                  </div>
                  <Spark curve={curve} up={b.perf.ret >= 0} />
                  <div className="grid grid-cols-4 gap-1 mt-1.5">
                    {[
                      ["WIN", `${b.perf.wr}%`],
                      ["PF", b.perf.pf.toFixed(2)],
                      ["MAX DD", `${b.perf.dd.toFixed(1)}%`],
                      ["TRADES", String(b.perf.trades)],
                    ].map(([l, v]) => (
                      <div key={l} className="text-center">
                        <div className="tag" style={{ color: "var(--text-faint)", fontSize: 7.5 }}>{l}</div>
                        <div className="mono text-[10.5px] font-semibold" style={{ color: l === "MAX DD" ? "var(--red)" : "var(--text)" }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-auto flex items-center gap-2">
                  <a
                    href={`/bots/${b.slug}.py`}
                    download
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold"
                    style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
                  >
                    <Download size={13} /> Download .py
                  </a>
                  <button
                    onClick={() => setViewing(b)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold"
                    style={{ background: "var(--bg-elevated)", color: "var(--text)" }}
                  >
                    <FileCode2 size={13} /> Code
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* how to run */}
        <div className="rounded-[14px] p-4 sm:p-5 mb-6" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2 mb-3">
            <Terminal size={15} style={{ color: "var(--text-muted)" }} />
            <span className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>Run one in 30 seconds</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              ["1", "Have Python 3.10+", "python --version — that's the only requirement. No pip installs, ever."],
              ["2", "Download a bot", "One .py file. Open it — the strategy, config and paper broker are all right there."],
              ["3", "Run it", "python momo-cross.py ETH-USD — trades log to the console and a CSV next to the file."],
            ].map(([n, t, d]) => (
              <div key={n} className="rounded-lg p-3" style={{ background: "var(--bg-elevated)" }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="mono flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold" style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>{n}</span>
                  <span className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>{t}</span>
                </div>
                <p className="mono text-[10.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>{d}</p>
              </div>
            ))}
          </div>
        </div>

        {/* roadmap */}
        <div className="flex items-center gap-2 flex-wrap mb-6">
          {[
            ["NOW", "Local · paper trading", true],
            ["PLANNED", "Hosted 24/7 deployment", false],
            ["PLANNED", "Live execution, key-gated per order", false],
          ].map(([tag, label, now]) => (
            <span key={label as string} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10.5px]" style={{ background: now ? "var(--green-tint)" : "var(--bg-elevated)", color: now ? "var(--green)" : "var(--text-faint)" }}>
              <Bot size={11} /> <b>{tag}</b> {label}
            </span>
          ))}
        </div>

        {/* disclaimer */}
        <div className="flex items-start gap-2.5 rounded-[14px] px-4 py-3.5" style={{ background: "var(--bg-elevated)" }}>
          <AlertTriangle size={14} style={{ color: "var(--text-faint)", marginTop: 1.5, flexShrink: 0 }} />
          <p className="text-[10.5px] leading-relaxed" style={{ color: "var(--text-faint)" }}>
            The performance cards are <b>simulated backtests</b> — fixed parameters over one recent 90-day window,
            taker fees only, no slippage or queue modelling. They describe each strategy's character
            (a 38%-win-rate breakout system and a 71%-win-rate grid FEEL very different to run), not expected returns.
            Past simulation ≠ future performance. Everything is paper-only in this release; nothing can spend real funds.
          </p>
        </div>
      </div>

      {viewing && <CodeModal bot={viewing} onClose={() => setViewing(null)} />}
    </main>
  );
}
