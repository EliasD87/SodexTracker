"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Megaphone, TriangleAlert } from "lucide-react";
import { cachedApiFetch } from "@/lib/fetchCache";
import { AnnouncementModal } from "@/components/AnnouncementModal";
import type { LatestAnnouncement } from "@/app/api/sodex/announcements/latest/route";

/**
 * The newest SoDEX announcement, presented as a single wide bulletin.
 *
 * Renders nothing if the feed is unreachable — a broken card is worse than no
 * card on the landing page, and the announcement band is supplementary.
 */

const ANNOUNCEMENTS_URL = "https://sodex.com/announcement";
const NEW_FOR_MS = 5 * 24 * 60 * 60 * 1000;

/* The category hue lives in CSS (`--ann`, keyed off data-ann in globals.css) so
   it can differ per theme; here we only ever reference it. */
const HUE = "var(--ann)";
const tint = (pct: number) => `color-mix(in srgb, var(--ann) ${pct}%, transparent)`;

function relativeTime(ts: number, now: number): string {
  const mins = Math.round((now - ts) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}M AGO`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}H AGO`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}D AGO`;
  const months = Math.round(days / 30);
  return months < 12 ? `${months}MO AGO` : `${Math.round(months / 12)}Y AGO`;
}

const fmtDate = (ts: number) =>
  new Date(ts)
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    .toUpperCase();

/**
 * Stand-in artwork for announcements that ship without a hero image: concentric
 * arcs radiating from one corner, like a broadcast. Seeded by id so a given
 * announcement always draws the same mark.
 */
function SignalMark({ id }: { id: number }) {
  const rings = [26, 44, 62, 80, 98];
  const offset = id % 7;
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" aria-hidden="true" style={{ display: "block" }}>
      {rings.map((r, i) => (
        <circle
          key={r}
          cx={18}
          cy={102}
          r={r + offset}
          fill="none"
          stroke={HUE}
          strokeWidth={1}
          opacity={0.5 - i * 0.08}
        />
      ))}
      <circle cx={18} cy={102} r={4} fill={HUE} opacity={0.9} />
    </svg>
  );
}

export function AnnouncementCard() {
  const [item, setItem] = useState<LatestAnnouncement | null>(null);
  const [failed, setFailed] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  // Clock read once, when the data lands — reading it during render is impure
  // and would also risk an SSR/client hydration mismatch on the age labels.
  const [now, setNow] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    cachedApiFetch<LatestAnnouncement>("/api/sodex/announcements/latest", 1, 5 * 60 * 1000)
      .then((a) => {
        setNow(Date.now());
        setItem(a);
      })
      .catch(() => setFailed(true));
  }, []);

  if (failed) return null;

  const isAlert = item?.style === "alert";
  const isNew = item ? now - item.publishedAt < NEW_FOR_MS : false;
  const showImage = !!item?.image && !imgFailed;

  return (
    <section
      className="py-10 sm:py-16 border-b"
      style={{ borderColor: "var(--border-subtle)" }}
      data-ann={item?.label ?? "Updates"}
      data-ann-alert={isAlert ? "true" : undefined}
    >
      <div className="max-w-[1200px] mx-auto px-5">
        {/* Section header — mirrors the other landing bands */}
        <div className="flex items-end justify-between mb-5 sm:mb-8">
          <h2
            className="text-xl sm:text-[28px] font-bold tracking-tight leading-none"
            style={{ color: "var(--text)", letterSpacing: "-0.02em" }}
          >
            Latest from SoDEX
          </h2>
          <a
            href={ANNOUNCEMENTS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1.5 text-xs mono transition-colors"
            style={{ color: "var(--text-faint)" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = HUE)}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-faint)")}
          >
            ALL ANNOUNCEMENTS <ArrowUpRight size={13} />
          </a>
        </div>

        {!item ? (
          <div
            className="rounded-[14px] h-[300px] sm:h-[172px] animate-pulse"
            style={{ background: "var(--bg-elevated)" }}
          />
        ) : (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="scan-host group relative block overflow-hidden rounded-[14px] transition-all"
            style={{
              background: isAlert ? tint(5) : "var(--bg-surface)",
              border: "1px solid var(--border)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.borderColor = tint(45);
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.borderColor = "var(--border)";
            }}
            onClick={(e) => {
              // Plain click reads it here; modified clicks keep the browser's
              // own behaviour so the article can still be opened on sodex.com.
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              e.preventDefault();
              setOpen(true);
            }}
          >
            <span className="scanline" />
            {/* Left edge carries the category hue — readable before any text is */}
            <span className="absolute inset-y-0 left-0 w-[3px] z-10" style={{ background: HUE }} />

            <div className="flex flex-col sm:flex-row">
              {/* Artwork — the hero image when there is one, else a seeded mark */}
              <div
                className="relative shrink-0 overflow-hidden announcement-art"
                style={{ background: tint(7) }}
              >
                {showImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.image!}
                    alt=""
                    onError={() => setImgFailed(true)}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                ) : (
                  // Absolute so the mark fills the panel without ever driving
                  // its height — the copy column decides how tall the card is.
                  <div className="absolute inset-0 flex items-center justify-center p-5">
                    <SignalMark id={item.id} />
                  </div>
                )}
              </div>

              {/* Body */}
              <div className="flex-1 min-w-0 p-4 sm:p-6 flex flex-col justify-center gap-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="tag inline-flex items-center gap-1.5 px-2 py-1 rounded-md leading-none"
                    style={{ background: tint(12), color: HUE }}
                  >
                    {isAlert ? <TriangleAlert size={11} /> : <Megaphone size={11} />}
                    {item.label ?? "Notice"}
                  </span>

                  {isNew && (
                    <span className="tag inline-flex items-center gap-1.5" style={{ color: HUE }}>
                      <span
                        className="live-dot inline-block rounded-full"
                        style={{ width: 6, height: 6, background: HUE }}
                      />
                      NEW
                    </span>
                  )}

                  <span className="tag ml-auto whitespace-nowrap" style={{ color: "var(--text-faint)" }}>
                    {relativeTime(item.publishedAt, now)} · {fmtDate(item.publishedAt)}
                  </span>
                </div>

                <h3
                  className="text-[16px] sm:text-[19px] font-semibold leading-snug"
                  style={{ color: "var(--text)", letterSpacing: "-0.01em" }}
                >
                  {item.title}
                </h3>

                {item.excerpt && (
                  <p
                    className="text-[13px] leading-relaxed"
                    style={{
                      color: "var(--text-muted)",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {item.excerpt}
                  </p>
                )}

                <div className="flex items-center justify-between gap-3 pt-0.5">
                  <span className="tag mono" style={{ color: "var(--text-faint)" }}>
                    NO. {item.id}
                  </span>
                  <span className="tag inline-flex items-center gap-1.5" style={{ color: HUE }}>
                    READ ANNOUNCEMENT
                    <ArrowUpRight
                      size={13}
                      className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    />
                  </span>
                </div>
              </div>
            </div>
          </a>
        )}
      </div>

      {open && item && createPortal(
        <AnnouncementModal item={item} onClose={() => setOpen(false)} />,
        document.body,
      )}
    </section>
  );
}
