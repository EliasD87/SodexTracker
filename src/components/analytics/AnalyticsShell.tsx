"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, Search } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { useAnalyticsWindow, useApi, useExchangeAnalytics, WINDOW_KEYS } from "@/components/analytics/hooks";
import { LiveDot } from "@/components/analytics/kit";
import type { HealthStatus } from "@/lib/liveStore";

const TABS = [
  { href: "/", label: "Overview", exact: true },
  { href: "/analytics/markets", label: "Markets" },
  { href: "/analytics/flow", label: "Money flow" },
  { href: "/analytics/positions", label: "Positions", live: true },
  { href: "/analytics/rankings", label: "Rankings", live: true },
  { href: "/analytics/traders", label: "Traders" },
  { href: "/analytics/funding", label: "Funding & risk" },
];

/** Views that show the live picture, where the daily window doesn't apply. */
const LIVE_PATHS = ["/analytics/positions", "/analytics/rankings", "/analytics/trader/"];

/** Find a wallet: the address search that used to sit in the home page hero. */
function AddressSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/tracker?address=${encodeURIComponent(q.trim())}`);
      }}
      className="flex items-center gap-2 h-9 px-3 rounded-[10px] flex-1 min-w-0 sm:flex-none sm:w-[240px] focus-within:shadow-[0_0_0_3px_var(--accent-dim)] transition-shadow"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
    >
      <Search size={14} style={{ color: "var(--text-faint)" }} aria-hidden />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Look up a wallet"
        aria-label="Wallet address"
        className="flex-1 min-w-0 bg-transparent outline-none text-[12.5px]"
        style={{ color: "var(--text)" }}
      />
    </form>
  );
}

/**
 * The dashboard frame, shared by Overview and every tab through the route
 * group's layout: it stays mounted while tabs change, so switching swaps only
 * the content below the tabs. Nothing above them reloads or moves.
 */
export function AnalyticsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [win, setWin] = useAnalyticsWindow();
  const live = LIVE_PATHS.some((p) => pathname.startsWith(p));
  // Every tab reads this same cached response, so it costs nothing extra here.
  const { data } = useExchangeAnalytics(win);
  // Whether the live figures are current (SoDEX maintenance, collector down).
  const health = useApi<{ status: HealthStatus }>("/api/analytics/health", 30_000, 60_000).data?.status;
  const liveOn = !(health && (health.state === "paused" || health.state === "offline"));

  const tab = TABS.find((t) => (t.exact ? pathname === t.href : pathname.startsWith(t.href)));
  const detail = pathname.startsWith("/analytics/markets/") ? "Market" : pathname.startsWith("/analytics/trader/") ? "Trader" : null;

  // Switching tabs keeps your place: if you'd scrolled past the tabs, the new
  // view starts right under them instead of jumping to the top of the page.
  const tabsRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const first = useRef(true);
  // On a phone the tabs scroll sideways: keep the current one in view.
  useEffect(() => {
    const nav = navRef.current;
    const on = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !on || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollTo({ left: on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2, behavior: first.current ? "auto" : "smooth" });
  }, [pathname]);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const el = tabsRef.current;
    if (!el) return;
    // A plain marker just above the sticky bar: its position never moves.
    const anchor = el.getBoundingClientRect().top + window.scrollY - 57;
    if (window.scrollY > anchor) window.scrollTo({ top: anchor });
  }, [pathname]);

  const through = data?.to ? new Date(`${data.to}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : null;

  return (
    <>
      <Navbar />
      <main className="max-w-[1240px] mx-auto px-4 sm:px-6 pt-[68px] sm:pt-[84px] pb-20">
        {/* No visible title: the active tab already says where you are. */}
        <h1 className="sr-only">{detail ?? tab?.label ?? "Overview"} · SoDEX in depth</h1>
        <div className="flex items-center justify-between gap-2">
          <AddressSearch />
          {/* One filter, above everything it scopes. Live views keep their
                place for it, so the header never shifts between tabs. */}
          <div
            className="flex items-center gap-0.5 sm:gap-1 h-9 p-[3px] rounded-[10px] shrink-0 transition-opacity"
            role="group"
            aria-label="Time window"
            title={live ? "This view is live; the window applies to the other tabs" : through ? `Complete UTC days through ${through}` : undefined}
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", opacity: live ? 0.45 : 1 }}
          >
            <CalendarDays size={14} className="hidden sm:block mx-1.5 shrink-0" style={{ color: "var(--text-faint)" }} aria-hidden />
            {WINDOW_KEYS.map((k) => (
              <button
                key={k}
                aria-pressed={win === k}
                disabled={live}
                onClick={() => win !== k && setWin(k)}
                className="h-full px-2 sm:px-2.5 rounded-[7px] text-[11.5px] sm:text-[12px] font-semibold mono transition-colors disabled:cursor-default"
                style={{
                  background: win === k ? "var(--text)" : "transparent",
                  color: win === k ? "var(--bg)" : "var(--text-muted)",
                }}
              >
                {k}
              </button>
            ))}
          </div>
        </div>

        {health?.message && (
          <p
            role="status"
            className="mt-5 flex items-start gap-2.5 text-[12.5px] px-4 py-3"
            style={{
              borderRadius: 14,
              background: "color-mix(in srgb, var(--tier-niche) 10%, var(--bg-surface))",
              border: "1px solid color-mix(in srgb, var(--tier-niche) 35%, transparent)",
              color: "var(--text)",
            }}
          >
            <span className="mt-[5px] w-2 h-2 rounded-full shrink-0" style={{ background: "var(--tier-niche)" }} aria-hidden />
            {health.message}
          </p>
        )}

        {/* The section's navigation: pills that stay under the navbar while
            scrolling, so every view is one tap away. */}
        <div ref={tabsRef} aria-hidden />
        <div
          className="sticky top-14 z-40 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 sm:py-3 mt-1 sm:mt-2"
          style={{ background: "color-mix(in srgb, var(--bg) 85%, transparent)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
        >
          <nav
            ref={navRef}
            aria-label="Analytics sections"
            className="scroll-row flex gap-1 p-1 rounded-[14px]"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}
          >
            {TABS.map((t) => {
              const active = t === tab;
              return (
                <Link
                  key={t.href}
                  href={`${t.href}?w=${win}`}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className="shrink-0 sm:shrink sm:flex-1 flex items-center justify-center gap-1.5 px-3 h-8 sm:h-9 rounded-[10px] text-[12.5px] sm:text-[13px] font-medium whitespace-nowrap transition-colors"
                  style={{
                    background: active ? "var(--text)" : "transparent",
                    color: active ? "var(--bg)" : "var(--text-muted)",
                  }}
                >
                  {t.label}
                  {t.live && <LiveDot on={liveOn} />}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Keyed by path: each view fades in once, and the space below the
            tabs never collapses while it loads. */}
        <div key={pathname} className="dash-in min-h-[70vh]">
          {children}
        </div>
      </main>
    </>
  );
}
