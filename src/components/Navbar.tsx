"use client";

import { useTheme } from "@/components/ThemeProvider";
import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Sun, Moon, X, ChevronDown, FlaskConical, MoreHorizontal, History, BookOpen, PlayCircle, Coins, SearchX, BarChart3, Search, Wallet, Trophy, UserRound, LogOut, Lock, Copy, Bot, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

type NavLink = { kind: "link"; label: string; href: string; icon?: React.ReactNode };
type DropdownItem = { label: string; href: string; description: string; icon: React.ReactNode; comingSoon?: boolean };
type NavDropdown = { kind: "dropdown"; label: string; badge?: string; icon: React.ReactNode; items: DropdownItem[] };
type NavItem = NavLink | NavDropdown;

const NAV_ITEMS: NavItem[] = [
  { kind: "link", label: "Markets", href: "/#markets" },
  { kind: "link", label: "Tracker", href: "/tracker" },
  { kind: "link", label: "Portfolio", href: "/portfolio" },
  { kind: "link", label: "Leaderboard", href: "/leaderboard" },
  { kind: "link", label: "SoPoints", href: "/sopoints", icon: <Zap size={13} /> },
  {
    kind: "dropdown",
    label: "Beta",
    badge: "BETA",
    icon: <FlaskConical size={13} />,
    items: [
      {
        label: "Trade History",
        href: "/trade-history",
        description: "Full trade export & analytics",
        icon: <History size={14} />,
        comingSoon: true,
      },
      {
        label: "Journal",
        href: "#",
        description: "Log and annotate your trades",
        icon: <BookOpen size={14} />,
        comingSoon: true,
      },
      {
        label: "Demo Trading",
        href: "#",
        description: "Practice with paper money",
        icon: <PlayCircle size={14} />,
        comingSoon: true,
      },
      {
        label: "Accrued Funding",
        href: "#",
        description: "Track funding payments over time",
        icon: <Coins size={14} />,
        comingSoon: true,
      },
      {
        label: "Reverse Search",
        href: "#",
        description: "Find wallets by trade pattern",
        icon: <SearchX size={14} />,
        comingSoon: true,
      },
    ],
  },
  {
    kind: "dropdown",
    label: "More",
    icon: <MoreHorizontal size={13} />,
    items: [
      {
        label: "Copy Trading",
        href: "#",
        description: "Mirror trades from top traders",
        icon: <Copy size={14} />,
        comingSoon: true,
      },
      {
        label: "Trading Bots",
        href: "#",
        description: "Automate your strategies",
        icon: <Bot size={14} />,
        comingSoon: true,
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
          className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 min-w-[220px]"
          style={{
            background: "var(--panel-bg)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: "1px solid var(--border)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.28)",
            borderRadius: 10,
            zIndex: 60,
          }}
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          <div className="p-1.5 flex flex-col gap-0.5">
            {item.items.map((child) => {
              const isSoon = child.comingSoon;
              const isFlashing = flashedHref === child.href + child.label;

              if (isSoon) {
                return (
                  <button
                    key={child.href + child.label}
                    onClick={() => handleComingSoon(child.href + child.label)}
                    className="flex items-start gap-3 px-3 py-2.5 rounded-md w-full text-left transition-colors"
                    style={{ background: isFlashing ? "var(--bg-elevated)" : "transparent" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; }}
                    onMouseLeave={(e) => { if (!isFlashing) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <span className="mt-0.5 shrink-0" style={{ color: "var(--text-faint)" }}>{child.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-medium leading-tight" style={{ color: "var(--text-muted)" }}>
                          {child.label}
                        </span>
                        <span
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded leading-none shrink-0"
                          style={{
                            background: isFlashing ? "var(--accent-dim)" : "var(--bg-elevated)",
                            color: isFlashing ? "var(--accent)" : "var(--text-faint)",
                            border: `1px solid ${isFlashing ? "var(--accent)" : "var(--border)"}`,
                            letterSpacing: "0.05em",
                            transition: "all 0.2s",
                          }}
                        >
                          {isFlashing ? "COMING SOON" : "SOON"}
                        </span>
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: "var(--text-faint)" }}>
                        {child.description}
                      </div>
                    </div>
                  </button>
                );
              }

              return (
                <Link
                  key={child.href}
                  href={child.href}
                  className="flex items-start gap-3 px-3 py-2.5 rounded-md transition-colors"
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
                  <span className="mt-0.5 shrink-0" style={{ color: "var(--accent)" }}>{child.icon}</span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium leading-tight" style={{ color: "var(--text)" }}>
                      {child.label}
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: "var(--text-faint)" }}>
                      {child.description}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Mobile bottom nav items ── */
const BOTTOM_NAV = [
  { label: "Markets", href: "/", icon: BarChart3 },
  { label: "Tracker", href: "/tracker", icon: Search },
  { label: "Portfolio", href: "/portfolio", icon: Wallet },
  { label: "Board", href: "/leaderboard", icon: Trophy },
];

/* ── All pages shown in the More sheet ── */
type SheetPage = { label: string; href: string; icon: React.ElementType; comingSoon?: boolean };
const SHEET_PAGES: SheetPage[] = [
  { label: "Markets", href: "/", icon: BarChart3 },
  { label: "Tracker", href: "/tracker", icon: Search },
  { label: "Portfolio", href: "/portfolio", icon: Wallet },
  { label: "Leaderboard", href: "/leaderboard", icon: Trophy },
  { label: "SoPoints", href: "/sopoints", icon: Zap },
  { label: "Trade History", href: "/trade-history", icon: History, comingSoon: true },
  { label: "Journal", href: "#", icon: BookOpen, comingSoon: true },
  { label: "Demo Trading", href: "#", icon: PlayCircle, comingSoon: true },
  { label: "Accrued Funding", href: "#", icon: Coins, comingSoon: true },
  { label: "Reverse Search", href: "#", icon: SearchX, comingSoon: true },
  { label: "Copy Trading", href: "#", icon: Copy, comingSoon: true },
  { label: "Trading Bots", href: "#", icon: Bot, comingSoon: true },
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
          {/* Wordmark */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="font-semibold tracking-tight text-[15px]" style={{ color: "var(--text)" }}>
              SoDEX <span style={{ color: "var(--text-muted)" }}>Tracker</span>
            </span>
          </Link>

          {/* Mobile account icon (top-right) with dropdown */}
          <div className="md:hidden relative">
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
          <div className="hidden md:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
            {NAV_ITEMS.map((item) => {
              if (item.kind === "link") {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[13.5px] font-medium rounded-lg transition-colors"
                    style={{ color: active ? "var(--text)" : "var(--text-muted)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = active ? "var(--text)" : "var(--text-muted)")}
                  >
                    {item.icon}
                    {item.label}
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
          <div className="hidden md:flex items-center gap-2">
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
                  className="absolute right-0 top-full pt-2 w-[260px]"
                  style={{
                    zIndex: 70,
                  }}
                >
                  <div
                    className="p-3"
                    style={{
                      background: "var(--panel-bg)",
                      backdropFilter: "blur(16px)",
                      WebkitBackdropFilter: "blur(16px)",
                      border: "1px solid var(--border)",
                      boxShadow: "0 16px 44px rgba(0,0,0,0.28)",
                      borderRadius: 12,
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="flex items-center justify-center shrink-0"
                        style={{
                          width: 36,
                          height: 36,
                          border: "1px solid var(--border)",
                          background: "var(--bg-surface)",
                          borderRadius: 10,
                        }}
                      >
                        <UserRound size={16} style={{ color: user ? "var(--green)" : "var(--text-faint)" }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: user ? "var(--green)" : "var(--text-faint)" }}
                          />
                          <span className="tag" style={{ color: user ? "var(--green)" : "var(--text-faint)" }}>
                            {user ? "SYNCED" : "LOCAL"}
                          </span>
                        </div>
                        <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>
                          {user?.email ?? "Signed out"}
                        </p>
                        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                          {user ? "Watchlist sync is active." : "Sign in to sync watchlists."}
                        </p>
                      </div>
                    </div>

                    <Link
                      href="/account"
                      className="mt-3 flex items-center justify-center px-3 py-2 tag font-bold"
                      style={{ border: "1px solid var(--border)", color: "var(--text)", background: "var(--bg-surface)", borderRadius: 9 }}
                    >
                      {user ? "MANAGE ACCOUNT" : "SIGN IN"}
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
              className="flex items-center px-3.5 py-1.5 text-[13.5px] font-semibold rounded-lg transition-opacity hover:opacity-90"
              style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
            >
              Open Tracker
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Mobile bottom nav bar ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-stretch"
        style={{
          background: "var(--panel-bg)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderTop: "1px solid var(--border)",
          height: 60,
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {BOTTOM_NAV.map(({ label, href, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={label}
              href={href}
              className="flex-1 flex flex-col items-center justify-center gap-1 transition-colors"
              style={{ color: active ? "var(--accent)" : "var(--text-faint)" }}
            >
              <Icon size={20} strokeWidth={active ? 2.2 : 1.7} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}

        {/* More tab */}
        <button
          onClick={() => setMoreOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-1 transition-colors"
          style={{ color: moreOpen ? "var(--accent)" : "var(--text-faint)" }}
          aria-label="More pages"
        >
          <MoreHorizontal size={20} strokeWidth={1.7} />
          <span className="text-[10px] font-medium">More</span>
        </button>
      </nav>

      {/* ── More sheet backdrop ── */}
      {moreOpen && (
        <div
          className="md:hidden fixed inset-0 z-[60]"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
          onClick={() => setMoreOpen(false)}
        />
      )}

      {/* ── More sheet (slides up) ── */}
      {moreOpen && (
      <div
        className="md:hidden fixed left-0 right-0 z-[70] rounded-t-2xl overflow-hidden"
        style={{
          bottom: 0,
          background: "var(--bg-surface)",
          borderTop: "1px solid var(--border)",
          animation: "sheetSlideUp 0.32s cubic-bezier(0.32, 0.72, 0, 1)",
          maxHeight: "80vh",
          overflowY: "auto",
        }}
      >
        {/* Sheet header */}
        <div
          className="sticky top-0 flex items-center justify-between px-5 py-4"
          style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border-subtle)" }}
        >
          <span className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: "var(--text-faint)" }}>
            All Pages
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
              style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button
              onClick={() => setMoreOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
              style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
              aria-label="Close"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Pages grid */}
        <div className="grid grid-cols-3 gap-2.5 p-4 pb-6">
          {SHEET_PAGES.map((page) => {
            const Icon = page.icon;
            const active = isActive(page.href);
            if (page.comingSoon) {
              return (
                <div
                  key={page.label}
                  className="flex flex-col items-center justify-center gap-2 py-4 rounded-xl relative"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-subtle)",
                    opacity: 0.55,
                  }}
                >
                  <Icon size={22} strokeWidth={1.5} style={{ color: "var(--text-faint)" }} />
                  <span className="text-[11px] font-medium text-center leading-tight" style={{ color: "var(--text-faint)" }}>
                    {page.label}
                  </span>
                  <span
                    className="absolute top-2 right-2 text-[8px] font-bold px-1 py-0.5 rounded leading-none"
                    style={{ background: "var(--bg-elevated)", color: "var(--text-faint)", border: "1px solid var(--border)" }}
                  >
                    SOON
                  </span>
                </div>
              );
            }
            return (
              <Link
                key={page.label}
                href={page.href}
                onClick={() => setMoreOpen(false)}
                className="flex flex-col items-center justify-center gap-2 py-4 rounded-xl transition-colors active:scale-95"
                style={{
                  background: active ? "var(--accent-dim)" : "var(--bg-elevated)",
                  border: `1px solid ${active ? "var(--accent)" : "var(--border-subtle)"}`,
                  color: active ? "var(--accent)" : "var(--text-muted)",
                  transform: "scale(1)",
                  transition: "transform 0.1s, background 0.15s",
                }}
              >
                <Icon size={22} strokeWidth={active ? 2 : 1.5} />
                <span className="text-[11px] font-medium text-center leading-tight">{page.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
      )}
    </>
  );
}
