"use client";

import { BarChart2, Trophy, Zap, Users, Search, Activity } from "lucide-react";

const FEATURES = [
  {
    icon: BarChart2,
    tag: "Market Volume",
    title: "Real-time market depth",
    desc: "Track 24H volume, open interest, and liquidity across all SoDEX perpetual markets and pairs.",
    cta: "Explore Markets",
  },
  {
    icon: Trophy,
    tag: "Leaderboard",
    title: "Top trader rankings",
    desc: "See who's dominating the markets. PnL rankings, win rates, and position sizes updated live.",
    cta: "View Leaderboard",
  },
  {
    icon: Zap,
    tag: "Pair Activity",
    title: "Pair-level analytics",
    desc: "Discover top gaining pairs, market movers, and capital flow across RWA and crypto markets.",
    cta: "See Pair Activity",
  },
  {
    icon: Search,
    tag: "Address Lookup",
    title: "Track any wallet",
    desc: "Search any public key to view full trading history, PnL breakdown, active positions, and performance.",
    cta: "Search Address",
  },
  {
    icon: Activity,
    tag: "Trading Activity",
    title: "Live trade feed",
    desc: "Watch trades execute in real time. Filter by pair, size, or direction across the entire DEX.",
    cta: "View Activity",
  },
  {
    icon: Users,
    tag: "Community",
    title: "Transparent analytics",
    desc: "Community-built, open, and honest. No dark patterns. Just clean data for every trader.",
    cta: "Learn More",
  },
];

export function Features() {
  return (
    <section id="markets" className="py-28">
      <div className="max-w-[1200px] mx-auto px-5">
        {/* Section header */}
        <div className="flex items-end justify-between mb-14 gap-6">
          <div>
            <div className="text-xs mono tracking-widest mb-3" style={{ color: "var(--accent)" }}>
              /01 — FEATURES
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
              Everything you need
              <br />
              to track SoDEX.
            </h2>
          </div>
          <p className="hidden md:block max-w-[280px] text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Real-time data, no noise. Built for traders who need signal over clutter.
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px" style={{ background: "var(--border-subtle)" }}>
          {FEATURES.map(({ icon: Icon, tag, title, desc, cta }) => (
            <div
              key={tag}
              className="feature-card p-7 flex flex-col gap-4 cursor-pointer"
              style={{ background: "var(--bg)" }}
            >
              {/* Icon */}
              <div
                className="w-9 h-9 flex items-center justify-center rounded-sm"
                style={{ background: "var(--accent-dim)", color: "var(--accent)" }}
              >
                <Icon size={17} />
              </div>

              {/* Tag */}
              <div
                className="inline-flex items-center text-[10px] mono tracking-wider px-1.5 py-0.5 rounded-sm w-fit"
                style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
              >
                {tag.toUpperCase()}
              </div>

              {/* Content */}
              <div>
                <h3 className="text-base font-semibold mb-2" style={{ color: "var(--text)" }}>
                  {title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  {desc}
                </p>
              </div>

              {/* CTA */}
              <div
                className="flex items-center gap-1.5 text-sm font-medium mt-auto group"
                style={{ color: "var(--accent)" }}
              >
                {cta}
                <span className="transition-transform group-hover:translate-x-0.5">→</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
