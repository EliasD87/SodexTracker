"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { cachedApiFetch } from "@/lib/fetchCache";
import type { ValueMintOverview, MintCollection } from "@/app/api/valuemint/collections/route";

/**
 * A small ValueMint promo that drops out from under the Open Tracker button,
 * rests, then slides back up — cycling a different open mint each time.
 *
 * It sits in the navbar, so it's deliberately unintrusive: absolutely
 * positioned (never shifts layout), inert to the pointer while retracted,
 * desktop-only by virtue of its container, and paused whenever it's hovered
 * so the thing can actually be clicked. Under prefers-reduced-motion it stops
 * sliding and simply stays put, cross-fading its content instead.
 */

/* One appearance per minute: six seconds on show, the rest of the minute away.
   At an eleven-second cycle it read as nagging rather than ambient. */
const SHOWN_MS = 6000;
const HIDDEN_MS = 54000;
/* The first entrance comes early, though — a flat 54s wait on load would mean
   most visitors never see it at all. Steady state is still once a minute. */
const FIRST_DELAY_MS = 6000;

const fmtSoso = (n: number) =>
  n >= 1
    ? n.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : n.toPrecision(2).replace(/0+$/, "").replace(/\.$/, "");

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

export function ValueMintTicker() {
  const [items, setItems] = useState<MintCollection[]>([]);
  const [idx, setIdx] = useState(0);
  const [open, setOpen] = useState(false);
  // Nothing animates until the first entrance, so the card doesn't play its
  // exit on page load.
  const [hasShown, setHasShown] = useState(false);
  const [paused, setPaused] = useState(false);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    let cancelled = false;
    cachedApiFetch<ValueMintOverview>("/api/valuemint/collections", 1, 5 * 60 * 1000)
      .then((d) => {
        if (cancelled) return;
        // Only ever advertise something still mintable.
        setItems(d.collections.filter((c) => !c.soldOut));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const count = items.length;

  // The loop: flip state on a timer, stepping to the next mint on each entrance.
  useEffect(() => {
    if (!count || paused) return;
    if (reduced) {
      // No sliding — the card just stays put (see `visible`) and rotates.
      const t = setInterval(() => setIdx((i) => (i + 1) % count), SHOWN_MS + HIDDEN_MS);
      return () => clearInterval(t);
    }
    const t = setTimeout(() => {
      if (open) {
        setOpen(false);
      } else {
        setIdx((i) => (i + 1) % count);
        setOpen(true);
        setHasShown(true);
      }
    }, open ? SHOWN_MS : hasShown ? HIDDEN_MS : FIRST_DELAY_MS);
    return () => clearTimeout(t);
  }, [open, paused, count, reduced, hasShown]);

  if (!count) return null;
  const c = items[Math.min(idx, count - 1)];
  // Reduced motion keeps it permanently out rather than sliding.
  const visible = reduced || open;

  return (
    <div
      className="absolute right-0 top-full mt-2 hidden md:block"
      style={{ zIndex: 60, pointerEvents: visible ? "auto" : "none" }}
      aria-hidden={!visible}
    >
      <a
        href={c.url}
        target="_blank"
        rel="noopener noreferrer"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        className={`group relative flex flex-col overflow-hidden rounded-xl ${
          hasShown && !reduced ? (visible ? "vm-in" : "vm-out") : ""
        }`}
        style={{
          width: 244,
          background: "var(--panel-bg)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid var(--border)",
          boxShadow: visible ? "0 14px 34px rgba(0,0,0,0.30)" : "0 0 0 rgba(0,0,0,0)",
          transition: "box-shadow 420ms ease",
          // The keyframes own transform/opacity once running; before the first
          // entrance the card simply sits hidden.
          ...(hasShown && !reduced ? null : { opacity: visible ? 1 : 0 }),
          transformOrigin: "top right",
        }}
      >
        {/* light sweeps across once on each entrance */}
        {visible && <span className="vm-sheen" aria-hidden="true" />}

        {/* Brand row */}
        <div
          className="flex items-center gap-1.5 px-3 pt-2.5 pb-2"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <svg viewBox="0 0 32 32" width={13} height={13} aria-hidden="true" style={{ color: "var(--text)" }}>
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              fill="currentColor"
              d="M16 0a16 16 0 1 1 0 32 16 16 0 0 1 0-32ZM9 9.5 14.1 22h3.8L23 9.5h-3.5L16 18.1 12.5 9.5H9Z"
            />
          </svg>
          <span className="tag" style={{ color: "var(--text)" }}>ValueMint</span>
          <span className="tag ml-auto flex items-center gap-1" style={{ color: "var(--green)" }}>
            <span className="live-dot w-1 h-1 rounded-full" style={{ background: "var(--green)" }} />
            MINTING
          </span>
        </div>

        {/* The mint on show — keyed so each rotation fades its content in */}
        <div key={c.address} className="vm-swap flex items-center gap-2.5 p-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={c.hero}
            alt=""
            width={40}
            height={40}
            className="rounded-lg shrink-0 object-cover"
            style={{ width: 40, height: 40, border: "1px solid var(--border-subtle)" }}
          />
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-semibold truncate" style={{ color: "var(--text)" }}>
              {c.name}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="mono text-[11px] font-bold tabular-nums" style={{ color: "var(--text)" }}>
                {fmtSoso(c.priceSoso)}
              </span>
              <span className="tag text-[9px]" style={{ color: "var(--text-faint)" }}>SOSO</span>
              <span className="mono text-[10px] ml-auto tabular-nums" style={{ color: "var(--text-muted)" }}>
                {c.remaining.toLocaleString("en-US")} left
              </span>
            </div>
          </div>
          <ArrowUpRight
            size={13}
            className="shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            style={{ color: "var(--text-faint)" }}
          />
        </div>

        {/* Dwell indicator — quietly shows the card is on a rotation */}
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-0 h-px"
          style={{
            background: "var(--accent)",
            opacity: 0.35,
            width: visible && !paused ? "100%" : "0%",
            transition: visible && !paused ? `width ${SHOWN_MS}ms linear` : "width 200ms ease",
          }}
        />
      </a>
    </div>
  );
}
