"use client";

import { useTheme } from "@/components/ThemeProvider";
import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Sun, Moon, X, ChevronDown, MoreHorizontal, History, BookOpen, PlayCircle, Coins, SearchX, BarChart3, Search, Wallet, Trophy, UserRound, LogOut, Lock, Zap, Radar } from "lucide-react";
import Link from "next/link";
import { LogoMark } from "@/components/LogoMark";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

type NavLink = { kind: "link"; label: string; href: string; icon?: React.ReactNode;
  /** Rendered after the label — lets a word be replaced by a glyph. */
  iconAfter?: React.ReactNode;
  /** Spoken name, when the visible label is abbreviated. */
  ariaLabel?: string };
type DropdownItem = { label: string; href: string; description: string; icon: React.ReactNode; comingSoon?: boolean; beta?: boolean };
type NavDropdown = { kind: "dropdown"; label: string; badge?: string; icon: React.ReactNode; items: DropdownItem[] };
type NavItem = NavLink | NavDropdown;

const NAV_ITEMS: NavItem[] = [
  { kind: "link", label: "Markets", href: "/" },
  { kind: "link", label: "Tracker", href: "/tracker" },
  { kind: "link", label: "Intelligence", href: "/intelligence", icon: <Radar size={13} style={{ color: "#7C6BF0" }} /> },
  { kind: "link", label: "Portfolio", href: "/portfolio" },
  { kind: "link", label: "Leaderboard", href: "/leaderboard" },
  { kind: "link", label: "SoPoints", href: "/sopoints", icon: <Zap size={13} style={{ color: "var(--green)" }} /> },
  // "Search" becomes the glyph so the item stays on one line.
  { kind: "link", label: "Reverse", href: "/reverse-search", ariaLabel: "Reverse Search",
    iconAfter: <SearchX size={13} /> },
  {
    kind: "dropdown",
    label: "More",
    icon: <MoreHorizontal size={13} />,
    items: [
      {
        label: "Trade History",
        href: "/trade-history",
        description: "Full trade export & analytics",
        icon: <History size={14} />,
      },
      {
        label: "Accrued Funding",
        href: "/accrued-funding",
        description: "Track funding payments over time",
        icon: <Coins size={14} />,
      },
      {
        label: "Journal",
        href: "/journal",
        description: "Log and annotate your trades",
        icon: <BookOpen size={14} />,
      },
      {
        label: "Demo Trading",
        href: "/trade/BTC-USD",
        description: "Practice with paper money",
        icon: <PlayCircle size={14} />,
      },
    ],
  },
];

function NavDropdownMenu({
  item,
  isAnyChildActive,
}: {
  item: NavDropdown;
  isAnyChildActive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [flashedHref, setFlashedHref] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setOpen(true);
  };
  const hide = () => {
    timerRef.current = setTimeout(() => setOpen(false), 120);
  };

  const handleComingSoon = (href: string) => {
    setFlashedHref(href);
    setTimeout(() => setFlashedHref(null), 1400);
  };

  return (
    <div ref={ref} className="relative" onMouseEnter={show} onMouseLeave={hide}>
      <button
        className="flex items-center gap-1.5 px-3 py-1.5 text-[13.5px] font-medium rounded-lg transition-colors select-none"
        style={{ color: open || isAnyChildActive ? "var(--text)" : "var(--text-muted)" }}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {item.icon}
        {item.label}
        {item.badge && (
          <span
            className="text-[9px] font-bold px-1 py-0.5 rounded leading-none"
            style={{ background: "var(--accent-dim)", color: "var(--accent)", letterSpacing: "0.05em" }}
          >
            {item.badge}
          </span>
        )}
        <ChevronDown
          size={11}
          style={{
            transition: "transform 0.18s",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            color: "var(--text-faint)",
          }}
        />
      </button>

      {open && item.items.length > 0 && (
        <div
          className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5"
          style={{
            background: "var(--panel-bg)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: "1px solid var(--border)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.28)",
            borderRadius: 10,
            zIndex: 60,
            minWidth: 132,
          }}
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          <div className="p-1" style={{display:"flex",flexDirection:"column",gap:1}}>
            {item.items.map((child) => {
              const isSoon = child.comingSoon;
              const isFlashing = flashedHref === child.href + child.label;

              if (isSoon) {
                return (
                  <button
                    key={child.href + child.label}
                    onClick={() => handleComingSoon(child.href + child.label)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md w-full text-left transition-colors"
                    style={{ background: isFlashing ? "var(--bg-elevated)" : "transparent" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; }}
                    onMouseLeave={(e) => { if (!isFlashing) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <span className="shrink-0" style={{ color: "var(--text-faint)" }}>{child.icon}</span>
                    <span className="text-[11.5px] font-medium flex-1 text-left" style={{ color: "var(--text-muted)" }}>
                      {child.label}
                    </span>
                    <span
                      className="text-[8px] font-bold px-1 leading-none shrink-0"
                      style={{
                        color: isFlashing ? "var(--accent)" : "var(--text-faint)",
                        border: `1px solid ${isFlashing ? "var(--accent)" : "var(--border)"}`,
                        letterSpacing: "0.04em",
                        borderRadius: 3,
                        transition: "all 0.2s",
                      }}
                    >
                      SOON
                    </span>
                  </button>
                );
              }

              return (
                <Link
                  key={child.href}
                  href={child.href}
                  prefetch={true}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)";
                    (e.currentTarget as HTMLElement).style.color = "var(--text)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                    (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
                  }}
                  onClick={() => setOpen(false)}
                >
                  <span className="shrink-0" style={{ color: "var(--accent)" }}>{child.icon}</span>
                  <span className="text-[11.5px] font-medium flex-1" style={{ color: "var(--text)" }}>
                    {child.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Watchlist bookmark with a green segment endlessly tracing the outline ── */
function AnimatedBookmark({ size = 16 }: { size?: number }) {
  const d = "M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {/* base outline inherits the button's color */}
      <path d={d} stroke="currentColor" strokeWidth={2} opacity={0.55} />
      {/* soft glow underlay so the runner reads at small sizes */}
      <path
        d={d}
        pathLength={100}
        stroke="var(--green)"
        strokeWidth={5}
        opacity={0.35}
        style={{ strokeDasharray: "30 70", animation: "wlTrace 2.2s linear infinite", filter: "blur(2px)" }}
      />
      {/* travelling green segment: 30% of the path, looping continuously */}
      <path
        d={d}
        pathLength={100}
        stroke="var(--green)"
        strokeWidth={2.6}
        style={{ strokeDasharray: "30 70", animation: "wlTrace 2.2s linear infinite", filter: "drop-shadow(0 0 2.5px var(--green))" }}
      />
    </svg>
  );
}

/* ── Mobile bottom nav items ── */

/* ── All pages shown in the More sheet ── */
type SheetPage = { label: string; href: string; icon: React.ElementType; iconColor?: string; comingSoon?: boolean; beta?: boolean };
const SHEET_PAGES: SheetPage[] = [
  { label: "Markets", href: "/", icon: BarChart3 },
  { label: "Tracker", href: "/tracker", icon: Search },
  { label: "Intelligence", href: "/intelligence", icon: Radar, iconColor: "#7C6BF0" },
  { label: "Portfolio", href: "/portfolio", icon: Wallet },
  { label: "Leaderboard", href: "/leaderboard", icon: Trophy },
  { label: "SoPoints", href: "/sopoints", icon: Zap, iconColor: "var(--green)" },
  { label: "Trade History", href: "/trade-history", icon: History },
  { label: "Journal", href: "/journal", icon: BookOpen },
  { label: "Demo Trading", href: "/trade/BTC-USD", icon: PlayCircle },
  { label: "Accrued Funding", href: "/accrued-funding", icon: Coins },
  { label: "Reverse Search", href: "/reverse-search", icon: SearchX },
];

export function Navbar() {
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const accountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Lock body scroll when sheet is open */
  useEffect(() => {
    if (moreOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [moreOpen]);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const isActive = (href: string) => {
    const path = href.split("#")[0];
    if (path === "/" || path === "") return pathname === "/";
    return pathname.startsWith(path);
  };

  const isDropdownActive = (item: NavDropdown) =>
    item.items.some((child) => isActive(child.href));

  const showAccount = () => {
    if (accountTimerRef.current) clearTimeout(accountTimerRef.current);
    setAccountOpen(true);
  };

  const hideAccount = () => {
    accountTimerRef.current = setTimeout(() => setAccountOpen(false), 180);
  };

  return (
    <>
      {/* ── Watchlist icon animation keyframes ── */}
      <style>{`
        @keyframes wlStamp {
          0%, 72%, 100% { transform: rotate(0deg) scale(1); }
          78% { transform: rotate(-12deg) scale(0.92); }
          84% { transform: rotate(8deg) scale(1.08); }
          90% { transform: rotate(-4deg) scale(0.98); }
          95% { transform: rotate(0deg) scale(1); }
        }
        @keyframes wlGlow {
          0%, 72%, 100% { filter: drop-shadow(0 0 0 transparent); }
          82% { filter: drop-shadow(0 0 4px var(--accent)); }
          90% { filter: drop-shadow(0 0 0 transparent); }
        }
      `}</style>

      {/* ── Desktop / top navbar ── */}
      <nav
        className="fixed top-0 left-0 right-0 z-50"
        style={{
          background: scrolled ? "var(--panel-bg)" : "transparent",
          borderBottom: `1px solid ${scrolled ? "var(--border)" : "transparent"}`,
          backdropFilter: scrolled ? "blur(12px)" : "none",
          WebkitBackdropFilter: scrolled ? "blur(12px)" : "none",
          transition: "background 0.2s, border-color 0.2s",
        }}
      >
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 h-14 flex items-center justify-between">
          {/* Menu + wordmark */}
          <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setMoreOpen(true)}
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg transition-colors -ml-2"
            style={{ color: moreOpen ? "var(--accent)" : "var(--text-muted)" }}
            aria-label="Open menu"
            aria-expanded={moreOpen}
          >
            <MoreHorizontal size={20} />
          </button>
          <Link href="/" prefetch={true} className="flex items-center gap-2 shrink-0">
            <LogoMark size={20} />
            <span className="font-semibold tracking-tight text-[15px]" style={{ color: "var(--text)" }}>
              SoDEX <span style={{ color: "var(--text-muted)" }}>Tracker</span>
            </span>
          </Link>
          </div>

          {/* Mobile watchlist + account icons (top-right) */}
          <div className="md:hidden flex items-center gap-1 relative">
            <Link
              href="/watchlist"
              prefetch={true}
              className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors relative"
              style={{
                color: isActive("/watchlist") ? "var(--accent)" : "var(--text-muted)",
                background: isActive("/watchlist") ? "var(--bg-elevated)" : "transparent",
              }}
              aria-label="Watchlist"
            >
              <AnimatedBookmark size={18} />
            </Link>
            <button
              onClick={() => setAccountOpen((v) => !v)}
              className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors"
              style={{
                color: isActive("/account") || accountOpen ? "var(--accent)" : "var(--text-muted)",
                background: accountOpen ? "var(--bg-elevated)" : "transparent",
              }}
              aria-label="Account"
            >
              {user ? <UserRound size={18} style={{ color: "var(--green)" }} /> : <UserRound size={18} />}
            </button>

            {accountOpen && (
              <>
                <div
                  className="fixed inset-0 z-[65]"
                  onClick={() => setAccountOpen(false)}
                />
                <div
                  className="absolute right-0 top-full mt-1 w-[240px] z-[66] p-3"
                  style={{
                    background: "var(--panel-bg)",
                    backdropFilter: "blur(16px)",
                    WebkitBackdropFilter: "blur(16px)",
                    border: "1px solid var(--border)",
                    boxShadow: "0 16px 44px rgba(0,0,0,0.28)",
                    borderRadius: 12,
                  }}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div
                      className="flex items-center justify-center shrink-0"
                      style={{
                        width: 34, height: 34,
                        border: "1px solid var(--border)",
                        background: "var(--bg-surface)",
                        borderRadius: 9,
                      }}
                    >
                      <UserRound size={15} style={{ color: user ? "var(--green)" : "var(--text-faint)" }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: user ? "var(--green)" : "var(--text-faint)" }} />
                        <span className="tag" style={{ color: user ? "var(--green)" : "var(--text-faint)" }}>
                          {user ? "SYNCED" : "LOCAL"}
                        </span>
                      </div>
                      <p className="text-xs font-semibold truncate" style={{ color: "var(--text)" }}>
                        {user?.email ?? "Signed out"}
                      </p>
                    </div>
                  </div>

                  {user ? (
                    <button
                      onClick={async () => {
                        if (supabase) await supabase.auth.signOut();
                        setAccountOpen(false);
                      }}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 tag font-bold mb-2"
                      style={{ border: "1px solid var(--border)", color: "var(--text)", background: "var(--bg-surface)", borderRadius: 9 }}
                    >
                      <LogOut size={13} />
                      SIGN OUT
                    </button>
                  ) : (
                    <Link
                      href="/account"
                      prefetch={true}
                      onClick={() => setAccountOpen(false)}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 tag font-bold mb-2"
                      style={{ border: "1px solid var(--border)", color: "var(--text)", background: "var(--bg-surface)", borderRadius: 9 }}
                    >
                      <Lock size={13} />
                      SIGN IN
                    </Link>
                  )}

                  <Link
                    href="/account"
                    prefetch={true}
                    onClick={() => setAccountOpen(false)}
                    className="w-full flex items-center justify-center px-3 py-2 tag font-bold"
                    style={{ border: "1px solid var(--border)", color: "var(--text-muted)", background: "var(--bg)", borderRadius: 9 }}
                  >
                    MANAGE ACCOUNT
                  </Link>
                </div>
              </>
            )}
          </div>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-1 flex-1 justify-center px-4">
            {NAV_ITEMS.map((item) => {
              if (item.kind === "link") {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    prefetch={true}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[13.5px] font-medium rounded-lg transition-colors whitespace-nowrap"
                    style={{ color: active ? "var(--text)" : "var(--text-muted)" }}
                    aria-label={item.ariaLabel}
                    title={item.ariaLabel}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = active ? "var(--text)" : "var(--text-muted)")}
                  >
                    {item.icon}
                    {item.label}
                    {item.iconAfter}
                  </Link>
                );
              }
              return (
                <NavDropdownMenu
                  key={item.label}
                  item={item}
                  isAnyChildActive={isDropdownActive(item)}
                />
              );
            })}
          </div>

          {/* Right controls (desktop only) */}
          <div className="hidden md:flex items-center gap-2 shrink-0">
            {/* Watchlist icon with stamp animation + glow */}
            <Link
              href="/watchlist"
              prefetch={true}
              className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors relative"
              style={{
                color: isActive("/watchlist") ? "var(--accent)" : "var(--text-muted)",
                background: isActive("/watchlist") ? "var(--bg-elevated)" : "transparent",
              }}
              aria-label="Watchlist"
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; (e.currentTarget as HTMLElement).style.color = "var(--text)"; }}
              onMouseLeave={(e) => { if (!isActive("/watchlist")) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; } }}
            >
              <AnimatedBookmark size={16} />
            </Link>
            <div
              className="relative"
              onMouseEnter={showAccount}
              onMouseLeave={hideAccount}
              onFocus={showAccount}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAccountOpen(false);
              }}
            >
              <Link
                href="/account"
                prefetch={true}
                className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors"
                style={{
                  color: isActive("/account") || accountOpen ? "var(--text)" : "var(--text-muted)",
                  background: accountOpen ? "var(--bg-elevated)" : "transparent",
                }}
                aria-label="Account"
              >
                <UserRound size={16} />
              </Link>

              {accountOpen && (
                <div
                  className="absolute top-full mt-1.5"
                  style={{ left: "50%", transform: "translateX(-50%)", zIndex: 70, minWidth: 180,
                    background: "var(--panel-bg)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
                    border: "1px solid var(--border)", boxShadow: "0 8px 32px rgba(0,0,0,0.28)", borderRadius: 10,
                  }}
                >
                  <div className="p-2" style={{display:"flex",flexDirection:"column",gap:4}}>
                    {/* Status row */}
                    <div className="flex items-center gap-1.5 px-1.5 py-1">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: user ? "var(--green)" : "var(--text-faint)" }}/>
                      <span className="text-[11px] font-semibold truncate" style={{ color: user ? "var(--green)" : "var(--text-faint)" }}>
                        {user ? user.email : "Signed out"}
                      </span>
                    </div>
                    <Link
                      href="/account"
                      prefetch={true}
                      className="flex items-center justify-center px-2.5 py-1.5 rounded-md text-[11.5px] font-semibold transition-colors"
                      style={{ border: "1px solid var(--border)", color: "var(--text)", background: "var(--bg-surface)" }}
                      onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background="var(--bg-elevated)";}}
                      onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="var(--bg-surface)";}}
                      onClick={() => setAccountOpen(false)}
                    >
                      {user ? "Manage account" : "Sign in"}
                    </Link>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)";
                (e.currentTarget as HTMLElement).style.color = "var(--text)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
              }}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <Link
                href="/tracker"
                prefetch={true}
                className="relative overflow-hidden flex items-center px-3.5 py-1.5 text-[13.5px] font-semibold rounded-lg transition-opacity hover:opacity-90"
                style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
              >
                <span className="relative z-[1]">Open Tracker</span>
                {/* the roaming inspector */}
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 pointer-events-none"
                  style={{ animation: "spySweep 7s ease-in-out infinite", opacity: 0, zIndex: 2 }}
                >
                  <Search size={13} strokeWidth={2.6} style={{ color: "var(--accent-fg)", filter: "drop-shadow(0 0 3px rgba(0,0,0,0.25))" }} />
                </span>
              </Link>
          </div>
        </div>
      </nav>

      {/* ── Mobile drawer, entering from the left ── */}
      {moreOpen && (
        <div
          className="md:hidden fixed inset-0 z-[60]"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
          onClick={() => setMoreOpen(false)}
        />
      )}

      {moreOpen && (
        <aside
          className="drawer-in md:hidden fixed top-0 bottom-0 left-0 z-[70] flex flex-col"
          style={{
            width: "min(80vw, 310px)",
            background: "var(--bg-surface)",
            borderRight: "1px solid var(--border)",
            boxShadow: "14px 0 40px rgba(0,0,0,0.28)",
          }}
        >
          {/* Drawer header */}
          <div
            className="flex items-center justify-between px-4 h-14 shrink-0"
            style={{ borderBottom: "1px solid var(--border-subtle)" }}
          >
            <div className="flex items-center gap-2">
              <LogoMark size={18} />
              <span className="font-semibold tracking-tight text-[14px]" style={{ color: "var(--text)" }}>
                SoDEX <span style={{ color: "var(--text-muted)" }}>Tracker</span>
              </span>
            </div>
            <button
              onClick={() => setMoreOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-lg"
              style={{ color: "var(--text-muted)" }}
              aria-label="Close menu"
            >
              <X size={16} />
            </button>
          </div>

          {/* Pages */}
          <nav className="flex-1 overflow-y-auto py-2">
            {SHEET_PAGES.map((page) => {
              const Icon = page.icon;
              const active = isActive(page.href);
              if (page.comingSoon) {
                return (
                  <div
                    key={page.label}
                    className="flex items-center gap-3 px-4 py-2.5"
                    style={{ color: "var(--text-faint)", opacity: 0.6 }}
                  >
                    <Icon size={17} strokeWidth={1.6} />
                    <span className="text-[13.5px] font-medium flex-1">{page.label}</span>
                    <span className="tag" style={{ color: "var(--text-faint)" }}>SOON</span>
                  </div>
                );
              }
              return (
                <Link
                  key={page.label}
                  href={page.href}
                  prefetch={true}
                  onClick={() => setMoreOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors"
                  style={{
                    color: active ? "var(--accent)" : "var(--text-muted)",
                    background: active ? "var(--accent-dim)" : "transparent",
                    borderLeft: `2px solid ${active ? "var(--accent)" : "transparent"}`,
                  }}
                >
                  <Icon
                    size={17}
                    strokeWidth={active ? 2.1 : 1.6}
                    style={page.iconColor ? { color: page.iconColor } : undefined}
                  />
                  <span className="text-[13.5px] font-medium">{page.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Drawer footer */}
          <div
            className="flex items-center gap-2 px-4 py-3 shrink-0"
            style={{ borderTop: "1px solid var(--border-subtle)", paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
          >
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="flex items-center gap-2 px-3 py-2 rounded-lg flex-1"
              style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
              <span className="text-[12.5px] font-medium">{theme === "dark" ? "Light" : "Dark"}</span>
            </button>
            <Link
              href="/account"
              prefetch={true}
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg flex-1"
              style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
            >
              <UserRound size={15} />
              <span className="text-[12.5px] font-medium">Account</span>
            </Link>
          </div>
        </aside>
      )}

    </>
  );
}
