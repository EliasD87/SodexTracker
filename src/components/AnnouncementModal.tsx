"use client";

import { useEffect, useRef } from "react";
import { X, ArrowUpRight, Megaphone, TriangleAlert } from "lucide-react";
import type { Block, Span } from "@/lib/announcementBody";
import type { LatestAnnouncement } from "@/app/api/sodex/announcements/latest/route";

/**
 * Full announcement in a popup, so reading one doesn't send you off-site.
 *
 * The body arrives pre-parsed into an allow-listed block model (see
 * lib/announcementBody) and is rendered as plain React elements — no
 * dangerouslySetInnerHTML, so remote markup can never go live here.
 */

const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

function Spans({ spans }: { spans: Span[] }) {
  return (
    <>
      {spans.map((s, i) => {
        // Newlines come from <br>; the container keeps them via pre-wrap.
        const body = s.bold ? (
          <strong style={{ color: "var(--text)", fontWeight: 600 }}>{s.text}</strong>
        ) : s.italic ? (
          <em>{s.text}</em>
        ) : (
          s.text
        );
        if (!s.href) return <span key={i}>{body}</span>;
        return (
          <a
            key={i}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 break-words"
            style={{ color: "var(--ann)" }}
          >
            {body}
          </a>
        );
      })}
    </>
  );
}

function Body({ blocks }: { blocks: Block[] }) {
  return (
    <div className="flex flex-col gap-3.5">
      {blocks.map((b, i) => {
        if (b.type === "img") {
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={b.src}
              alt=""
              className="w-full rounded-lg"
              style={{ border: "1px solid var(--border-subtle)" }}
            />
          );
        }
        if (b.type === "h") {
          return (
            <h4
              key={i}
              className="text-[14px] font-semibold mt-1.5"
              style={{ color: "var(--text)", letterSpacing: "-0.01em" }}
            >
              <Spans spans={b.spans} />
            </h4>
          );
        }
        if (b.type === "ul") {
          return (
            <ul key={i} className="flex flex-col gap-2 pl-1">
              {b.items.map((item, j) => (
                <li key={j} className="flex gap-2.5 text-[13.5px] leading-relaxed">
                  <span aria-hidden="true" style={{ color: "var(--ann)" }}>
                    •
                  </span>
                  <span style={{ color: "var(--text-muted)", whiteSpace: "pre-wrap" }}>
                    <Spans spans={item} />
                  </span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p
            key={i}
            className="text-[13.5px] leading-relaxed"
            style={{ color: "var(--text-muted)", whiteSpace: "pre-wrap" }}
          >
            <Spans spans={b.spans} />
          </p>
        );
      })}
    </div>
  );
}

export function AnnouncementModal({
  item,
  onClose,
}: {
  item: LatestAnnouncement;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      opener?.focus?.();
    };
  }, [onClose]);

  const isAlert = item.style === "alert";
  const blocks = item.blocks ?? [];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
      data-ann={item.label ?? "Updates"}
      data-ann-alert={isAlert ? "true" : undefined}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="announcement-title"
        tabIndex={-1}
        className="relative w-full max-w-[680px] max-h-[88vh] overflow-y-auto rounded-2xl outline-none"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — sticky so the close button survives a long scroll */}
        <div
          className="sticky top-0 z-10 flex items-start justify-between gap-3 px-5 py-4"
          style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span
                className="tag inline-flex items-center gap-1.5 px-2 py-1 rounded-md leading-none"
                style={{
                  background: "color-mix(in srgb, var(--ann) 12%, transparent)",
                  color: "var(--ann)",
                }}
              >
                {isAlert ? <TriangleAlert size={11} /> : <Megaphone size={11} />}
                {item.label ?? "Notice"}
              </span>
              <span className="tag" style={{ color: "var(--text-faint)" }}>
                {fmtDate(item.publishedAt)} · NO. {item.id}
              </span>
            </div>
            <h3
              id="announcement-title"
              className="text-[16px] sm:text-[18px] font-semibold leading-snug"
              style={{ color: "var(--text)", letterSpacing: "-0.01em" }}
            >
              {item.title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full shrink-0"
            style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
            aria-label="Close announcement"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-5">
          {blocks.length ? (
            <Body blocks={blocks} />
          ) : (
            // Parsing produced nothing — fall back to the excerpt rather than
            // showing an empty dialog.
            <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              {item.excerpt || "This announcement has no preview available."}
            </p>
          )}
        </div>

        <div
          className="sticky bottom-0 flex items-center justify-between gap-3 px-5 py-3.5"
          style={{ background: "var(--bg-surface)", borderTop: "1px solid var(--border-subtle)" }}
        >
          <span className="tag" style={{ color: "var(--text-faint)" }}>
            SODEX ANNOUNCEMENT
          </span>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="tag inline-flex items-center gap-1.5"
            style={{ color: "var(--ann)" }}
          >
            OPEN ON SODEX.COM <ArrowUpRight size={13} />
          </a>
        </div>
      </div>
    </div>
  );
}
