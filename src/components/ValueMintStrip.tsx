"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { cachedApiFetch } from "@/lib/fetchCache";
import type { ValueMintOverview, MintCollection } from "@/app/api/valuemint/collections/route";

/**
 * Open mints on ValueMint — the NFT marketplace running on ValueChain, the
 * same L1 SoDEX settles on, priced in the same SOSO this app already tracks.
 *
 * Supply and price come live off-chain-state, so the counters are real. Renders
 * nothing if the read fails; a dead band is worse than no band.
 */

const REFRESH_MS = 60 * 1000;

const fmtSoso = (n: number) =>
  n >= 1 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : n.toPrecision(2).replace(/0+$/, "").replace(/\.$/, "");

function fmtUsd(n: number): string {
  if (n >= 1) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (n >= 0.01) return `$${n.toFixed(2)}`;
  return `$${n.toPrecision(2)}`;
}

function MintCard({ c, sosoUsd }: { c: MintCollection; sosoUsd: number | null }) {
  const pct = c.supply > 0 ? Math.min((c.minted / c.supply) * 100, 100) : 0;
  const usd = sosoUsd != null ? c.priceSoso * sosoUsd : null;

  return (
    <a
      href={c.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative flex flex-col overflow-hidden rounded-[14px] transition-all"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        opacity: c.soldOut ? 0.62 : 1,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.borderColor = "var(--accent-glow)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.borderColor = "var(--border)";
      }}
    >
      {/* Cover — ValueMint serves these itself, so no IPFS gateway in the path */}
      <div className="relative overflow-hidden" style={{ aspectRatio: "1 / 1", background: "var(--bg-elevated)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={c.hero}
          alt=""
          /* Not lazy: the band sits directly under the hero, so these four
             small WebPs are wanted on first paint, not on scroll. */
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          style={{ filter: c.soldOut ? "grayscale(1)" : undefined }}
        />
        {c.soldOut && (
          <span
            className="tag absolute top-2 right-2 px-1.5 py-1 rounded-md leading-none"
            style={{ background: "var(--bg)", color: "var(--text-muted)" }}
          >
            SOLD OUT
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-baseline justify-between gap-2 min-w-0">
          <span className="text-[13px] font-semibold truncate" style={{ color: "var(--text)" }}>
            {c.name}
          </span>
          <span className="tag shrink-0" style={{ color: "var(--text-faint)" }}>
            {c.symbol}
          </span>
        </div>

        <div className="flex items-baseline gap-1.5">
          <span className="mono text-[13px] font-bold tabular-nums" style={{ color: "var(--text)" }}>
            {fmtSoso(c.priceSoso)}
          </span>
          <span className="tag" style={{ color: "var(--text-faint)" }}>SOSO</span>
          {usd != null && (
            <span className="mono text-[10px] ml-auto tabular-nums" style={{ color: "var(--text-faint)" }}>
              ≈{fmtUsd(usd)}
            </span>
          )}
        </div>

        {/* Supply — the bit that actually moves */}
        <div className="flex flex-col gap-1">
          <div className="h-[3px] rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${pct}%`, background: "var(--accent)", transition: "width 0.6s ease" }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="mono text-[10px] tabular-nums" style={{ color: "var(--text-faint)" }}>
              {c.minted.toLocaleString("en-US")}/{c.supply.toLocaleString("en-US")}
            </span>
            <span className="mono text-[10px] tabular-nums" style={{ color: c.soldOut ? "var(--text-faint)" : "var(--text-muted)" }}>
              {c.soldOut ? "—" : `${c.remaining.toLocaleString("en-US")} left`}
            </span>
          </div>
        </div>
      </div>
    </a>
  );
}

export function ValueMintStrip() {
  const [data, setData] = useState<ValueMintOverview | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      cachedApiFetch<ValueMintOverview>("/api/valuemint/collections", 1, REFRESH_MS)
        .then((d) => {
          if (!cancelled) setData(d);
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (failed) return null;

  return (
    <section className="py-10 sm:py-16 border-b" style={{ borderColor: "var(--border-subtle)" }}>
      <div className="max-w-[1200px] mx-auto px-5">
        <div className="flex items-end justify-between mb-5 sm:mb-8">
          <h2
            className="text-xl sm:text-[28px] font-bold tracking-tight leading-none"
            style={{ color: "var(--text)", letterSpacing: "-0.02em" }}
          >
            Minting on ValueChain
          </h2>
          <a
            href={data?.siteUrl ?? "https://www.valuemint.store"}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1.5 text-xs mono transition-colors"
            style={{ color: "var(--text-faint)" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--accent)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-faint)")}
          >
            VALUEMINT <ArrowUpRight size={13} />
          </a>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {!data
            ? Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-[14px] animate-pulse"
                  style={{ background: "var(--bg-elevated)", aspectRatio: "1 / 1.5" }}
                />
              ))
            : data.collections.map((c) => <MintCard key={c.address} c={c} sosoUsd={data.sosoUsd} />)}
        </div>
      </div>
    </section>
  );
}
