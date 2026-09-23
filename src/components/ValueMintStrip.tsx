"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { cachedApiFetch } from "@/lib/fetchCache";
import type { ValueMintOverview, MintCollection } from "@/app/api/valuemint/collections/route";

/**
 * ValueMint collections — the NFT marketplace running on ValueChain, the same
 * L1 SoDEX settles on, priced in the same SOSO this app already tracks.
 *
 * Floor, listings and volume come off ValueMint's live order index and the
 * mint counters off-chain-state, so every figure here is real. Two of the four
 * collections are traded rather than minted, so the card leads with market
 * state and shows the mint only where one exists. Renders nothing if the read
 * fails; a dead band is worse than no band.
 */

const REFRESH_MS = 60 * 1000;
const SITE = "https://www.valuemint.store";

/**
 * ValueMint's own brand lockup, redrawn inline. The mark is a single path
 * filled with currentColor, so it takes the theme instead of needing a light
 * and a dark asset — and costs no request.
 */
function ValueMintBadge() {
  return (
    <a
      href={`${SITE}/`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="ValueMint"
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg shrink-0 transition-colors"
      style={{
        border: "1px solid var(--border)",
        background: "var(--bg-surface)",
        color: "var(--text-muted)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "var(--text)";
        e.currentTarget.style.borderColor = "var(--accent-glow)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "var(--text-muted)";
        e.currentTarget.style.borderColor = "var(--border)";
      }}
    >
      <svg viewBox="0 0 32 32" width={15} height={15} aria-hidden="true">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          fill="currentColor"
          d="M16 0a16 16 0 1 1 0 32 16 16 0 0 1 0-32ZM9 9.5 14.1 22h3.8L23 9.5h-3.5L16 18.1 12.5 9.5H9Z"
        />
      </svg>
      <span className="text-[12.5px] font-semibold tracking-tight">ValueMint</span>
    </a>
  );
}

const fmtSoso = (n: number) =>
  n >= 1000
    ? n.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : n >= 1
      ? n.toLocaleString("en-US", { maximumFractionDigits: 2 })
      : n.toPrecision(2).replace(/0+$/, "").replace(/\.$/, "");

function fmtUsd(n: number): string {
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  // Keep the cents: a floor that reads "$3" beside "$59.72" looks unpriced.
  if (n >= 1) return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (n >= 0.01) return `$${n.toFixed(2)}`;
  return `$${n.toPrecision(2)}`;
}

/** A labelled figure in the card's bottom row. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="tag leading-none" style={{ color: "var(--text-faint)" }}>
        {label}
      </span>
      <span className="mono text-[11.5px] font-semibold tabular-nums truncate" style={{ color: "var(--text-muted)" }}>
        {value}
      </span>
    </div>
  );
}

function CollectionCard({ c, sosoUsd }: { c: MintCollection; sosoUsd: number | null }) {
  const { mint } = c;
  const minting = !!mint && !mint.soldOut;
  const floorUsd = c.floorSoso != null && sosoUsd != null ? c.floorSoso * sosoUsd : null;
  const pct = mint && mint.supply > 0 ? Math.min((mint.minted / mint.supply) * 100, 100) : 0;

  return (
    <a
      href={c.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative flex flex-col overflow-hidden rounded-[14px] transition-all"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
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
        />
        {minting && (
          <span
            className="tag absolute top-2 right-2 px-1.5 py-1 rounded-md leading-none"
            style={{ background: "var(--accent)", color: "var(--bg)" }}
          >
            MINTING
          </span>
        )}
        {mint?.soldOut && (
          <span
            className="tag absolute top-2 right-2 px-1.5 py-1 rounded-md leading-none"
            style={{ background: "var(--bg)", color: "var(--text-muted)" }}
          >
            SOLD OUT
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2.5 p-3">
        <div className="flex items-baseline justify-between gap-2 min-w-0">
          <span className="text-[13px] font-semibold truncate" style={{ color: "var(--text)" }}>
            {c.name}
          </span>
          {/* Hidden on the narrowest cards: with the chip there, "SoDEXTreasureBox"
              and "ValueChain Genesis" both ellipsise, and without it both fit. */}
          <span className="tag shrink-0 hidden sm:inline" style={{ color: "var(--text-faint)" }}>
            {c.symbol}
          </span>
        </div>

        {/* Floor leads: it is the one figure every collection here has */}
        <div className="flex items-baseline gap-1.5">
          <span className="mono text-[15px] font-bold tabular-nums" style={{ color: "var(--text)" }}>
            {c.floorSoso != null ? fmtSoso(c.floorSoso) : "—"}
          </span>
          <span className="tag" style={{ color: "var(--text-faint)" }}>
            {/* listed === 0 means the index answered and nothing is for sale;
                listed === null means it never answered, which is not the same
                claim to make about the collection. */}
            {c.floorSoso != null ? "SOSO FLOOR" : c.listed === 0 ? "NOT LISTED" : "FLOOR"}
          </span>
          {floorUsd != null && (
            <span className="mono text-[10px] ml-auto tabular-nums" style={{ color: "var(--text-faint)" }}>
              ≈{fmtUsd(floorUsd)}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Stat label="LISTED" value={c.listed != null ? c.listed.toLocaleString("en-US") : "—"} />
          <Stat
            label="VOLUME"
            value={c.volumeSoso != null ? `${fmtSoso(c.volumeSoso)} SOSO` : "—"}
          />
        </div>

        {/* Mint progress, only where a mint actually exists */}
        {mint && (
          <div className="flex flex-col gap-1 pt-0.5">
            <div className="h-[3px] rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, background: "var(--accent)", transition: "width 0.6s ease" }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="mono text-[10px] tabular-nums" style={{ color: "var(--text-faint)" }}>
                {mint.minted.toLocaleString("en-US")}/{mint.supply.toLocaleString("en-US")} minted
              </span>
              <span
                className="mono text-[10px] tabular-nums"
                style={{ color: mint.soldOut ? "var(--text-faint)" : "var(--text-muted)" }}
              >
                {mint.soldOut ? "—" : `${fmtSoso(mint.priceSoso)} SOSO`}
              </span>
            </div>
          </div>
        )}
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
          if (cancelled) return;
          setData(d);
          // One bad poll used to hide the band for the rest of the session,
          // because nothing ever cleared this again.
          setFailed(false);
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
        <div className="flex items-end justify-between gap-3 mb-5 sm:mb-8">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <h2
              className="text-xl sm:text-[28px] font-bold tracking-tight leading-none"
              style={{ color: "var(--text)", letterSpacing: "-0.02em" }}
            >
              Collections on ValueChain
            </h2>
            <ValueMintBadge />
          </div>
          {/* The badge already goes to the site, so this points somewhere useful */}
          <a
            href={`${data?.siteUrl ?? SITE}/collections`}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1.5 text-xs mono transition-colors shrink-0"
            style={{ color: "var(--text-faint)" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--accent)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-faint)")}
          >
            ALL COLLECTIONS <ArrowUpRight size={13} />
          </a>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {!data
            ? /* Mirrors the real card — a square cover over a fixed text block —
                 so the band reserves the right height instead of jumping when
                 the read lands. */
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-[14px] overflow-hidden animate-pulse">
                  <div style={{ aspectRatio: "1 / 1", background: "var(--bg-elevated)" }} />
                  <div className="h-[132px] sm:h-[154px]" style={{ background: "var(--bg-surface)" }} />
                </div>
              ))
            : data.collections.map((c) => <CollectionCard key={c.address} c={c} sosoUsd={data.sosoUsd} />)}
        </div>
      </div>
    </section>
  );
}
