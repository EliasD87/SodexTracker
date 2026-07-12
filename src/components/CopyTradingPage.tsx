"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Copy,
  Users,
  Activity,
  ShieldCheck,
  AlertTriangle,
  ExternalLink,
  Crosshair,
  RefreshCw,
  Wallet,
  CheckCircle2,
  XCircle,
  Timer,
  Flame,
  GitCompareArrows,
  Check,
  ChevronDown,
  Target,
  Shield,
  Scale,
  FlaskConical,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { TokenIcon } from "@/components/TokenIcon";
import { tickerLabel } from "@/lib/tokenIcons";
import { cachedApiFetch } from "@/lib/fetchCache";

/**
 * Copy Trading (beta) — an ASSISTANT, not an executor.
 *
 * Watches any SoDEX trader live, scales their book to the user's capital, and
 * produces manually-placeable order plans complete with the leader's own TP/SL
 * targets, a per-market track record for each position, and drift detection
 * against the user's own account. Nothing here signs or submits — keys stay
 * with the user. Every number is live SoDEX public data or leaderboard/history.
 */

const GW = "https://mainnet-gw.sodex.dev/api/v1";
const DATA = "https://mainnet-data.sodex.dev/api/v1";
const POLL_MS = 8_000;
const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

/* ── SoDEX shapes ─────────────────────────────────────────────────────── */
interface StatePos {
  i: number; s: string; sz: string; ep: string; ur: string; l: number; lp: string; ct: number; ut: number;
}
interface StateOrder {
  s: string; sp: string; st: string; pid: number; // st: TAKE_PROFIT | STOP_LOSS
}
interface AccountState {
  aid: number; av: string; P?: StatePos[]; O?: StateOrder[];
}
interface SymbolMeta {
  id: number; name: string; stepSize: string; quantityPrecision: number; minQuantity: string; maxLeverage: number;
}
interface RankItem { pnl_usd: string; volume_usd: string; rank: number; }
interface HistoryPos {
  symbol_id: number; position_side: number; cum_closed_size: string; realized_pnl: string; leverage: number; created_at: number; updated_at: number; avg_entry_price?: string; avg_close_price?: string;
}
interface Overview { total_pnl_usd: string; roi: string; volume_usd: string; first_trade_ts_ms: number; }
interface LeaderboardRow { wallet_address: string; account_id: number; pnl_usd: string; rank: number; }

/* ── formatting ───────────────────────────────────────────────────────── */
const usd = (n: number, dp?: number) => {
  const abs = Math.abs(n);
  const s = abs >= 1e9 ? (abs / 1e9).toFixed(2) + "B" : abs >= 1e6 ? (abs / 1e6).toFixed(2) + "M" : abs >= 1e3 ? (abs / 1e3).toFixed(1) + "K" : abs.toFixed(dp ?? 2);
  return (n < 0 ? "-$" : "$") + s;
};
const px = (n: number) => "$" + (n >= 10_000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(4) : n.toFixed(6));
const pctRaw = (n: number, dp = 1) => (n >= 0 ? "+" : "") + n.toFixed(dp) + "%";
const tone = (n: number) => (n > 0 ? "var(--green)" : n < 0 ? "var(--red)" : "var(--text-muted)");
const short = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
const agoMs = (ms: number) => {
  const d = Date.now() - ms;
  if (d < 60_000) return "just now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
};
const durFmt = (ms: number) => {
  if (ms < 3_600_000) return `${Math.max(1, Math.round(ms / 60_000))}m`;
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)}h`;
  return `${(ms / 86_400_000).toFixed(1)}d`;
};
function floorToStep(qty: number, step: string): number {
  const s = parseFloat(step) || 0.0001;
  return Math.floor(qty / s + 1e-9) * s;
}
function stepDecimals(step: string): number {
  const i = step.indexOf(".");
  return i < 0 ? 0 : step.length - i - 1;
}
const liqEst = (isLong: boolean, entry: number, lev: number) => (isLong ? entry * (1 - 1 / lev + 0.005) : entry * (1 + 1 / lev - 0.005));

/* ── small building blocks ────────────────────────────────────────────── */
function StatBlock({ label, value, sub, color }: { label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string }) {
  return (
    <div className="rounded-lg p-2.5" style={{ background: "var(--bg-elevated)" }}>
      <div className="tag mb-1" style={{ color: "var(--text-faint)", fontSize: 8.5 }}>{label}</div>
      <div className="mono text-[13px] font-semibold" style={{ color: color ?? "var(--text)" }}>{value}</div>
      {sub && <div className="mono text-[9.5px] mt-0.5" style={{ color: "var(--text-faint)" }}>{sub}</div>}
    </div>
  );
}
function SideChip({ isLong, small }: { isLong: boolean; small?: boolean }) {
  const c = isLong ? "var(--green)" : "var(--red)";
  return <span className="tag px-1.5 py-0.5" style={{ color: c, border: `1px solid ${c}`, borderRadius: 3, fontSize: small ? 8 : 8.5 }}>{isLong ? "LONG" : "SHORT"}</span>;
}

/* ── feed events ──────────────────────────────────────────────────────── */
type FeedKind = "OPEN" | "CLOSE" | "INCREASE" | "REDUCE";
interface FeedEvent { ts: number; kind: FeedKind; symbol: string; isLong: boolean; detail: string; }
const FEED_COLOR: Record<FeedKind, string> = { OPEN: "var(--green)", CLOSE: "var(--red)", INCREASE: "var(--text)", REDUCE: "var(--text-muted)" };

/* per-market historical record derived from the recent 200 closed positions */
interface MarketRecord {
  trades: number;
  wins: number;
  net: number;
  avgHoldMs: number;
  best: number;
  worst: number;
  recent: { pnl: number; ts: number; lev: number; isLong: boolean }[];
}

/* ═══════════════════════════════════ page ═══════════════════════════════ */
export function CopyTradingPage() {
  const [input, setInput] = useState("");
  const [leader, setLeader] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [picks, setPicks] = useState<LeaderboardRow[]>([]);

  const [symbols, setSymbols] = useState<Map<string, SymbolMeta>>(new Map());
  const [idToName, setIdToName] = useState<Map<number, string>>(new Map());
  const [marks, setMarks] = useState<Map<string, number>>(new Map());

  const [state, setState] = useState<AccountState | null>(null);
  const [stateErr, setStateErr] = useState(false);
  const [ranks, setRanks] = useState<{ pnl7?: RankItem; volAll?: RankItem }>({});
  const [ov7, setOv7] = useState<Overview | null>(null);
  const [ov30, setOv30] = useState<Overview | null>(null);
  const [history, setHistory] = useState<HistoryPos[] | null>(null);
  const [lastPoll, setLastPoll] = useState<number>(0);

  const [capital, setCapital] = useState<number>(1000);
  const [copied, setCopied] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [myAddr, setMyAddr] = useState("");
  const [myState, setMyState] = useState<AccountState | null>(null);
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  const [orderCopied, setOrderCopied] = useState<number | null>(null);
  const prevPos = useRef<Map<number, StatePos> | null>(null);

  /* ── boot ── */
  useEffect(() => {
    try {
      const c = parseFloat(localStorage.getItem("sdx-copy-capital") ?? "");
      if (c > 0) setCapital(c);
      setRecent(JSON.parse(localStorage.getItem("sdx-copy-leaders") ?? "[]"));
      const my = localStorage.getItem("sdx-copy-myaddr") ?? localStorage.getItem("sodex-portfolio-address") ?? "";
      if (my) setMyAddr(my);
    } catch { /* first visit */ }

    cachedApiFetch<SymbolMeta[]>(`${GW}/perps/markets/symbols`)
      .then((list) => { setSymbols(new Map(list.map((s) => [s.name, s]))); setIdToName(new Map(list.map((s) => [s.id, s.name]))); })
      .catch(() => {});
    cachedApiFetch<{ items: LeaderboardRow[] }>(`${DATA}/leaderboard?window_type=7D&sort_by=pnl&page=1&page_size=20`)
      .then((d) => setPicks((d.items ?? []).slice(0, 6)))
      .catch(() => {});
  }, []);

  useEffect(() => { try { localStorage.setItem("sdx-copy-capital", String(capital)); } catch { /* ignore */ } }, [capital]);
  useEffect(() => { try { localStorage.setItem("sdx-copy-myaddr", myAddr); } catch { /* ignore */ } }, [myAddr]);

  const follow = useCallback((addr: string) => {
    const a = addr.trim();
    if (!ADDR_RE.test(a)) return;
    const lc = a.toLowerCase();
    setLeader(lc); setInput(a); setState(null); setStateErr(false); setRanks({}); setOv7(null); setOv30(null);
    setHistory(null); setFeed([]); setExpanded(new Set()); prevPos.current = null;
    try { setCopied(new Set(JSON.parse(localStorage.getItem(`sdx-copy-done:${lc}`) ?? "[]"))); } catch { setCopied(new Set()); }
    setRecent((r) => {
      const next = [lc, ...r.filter((x) => x !== lc)].slice(0, 5);
      try { localStorage.setItem("sdx-copy-leaders", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const toggleCopied = (posId: number) => {
    setCopied((prev) => {
      const next = new Set(prev);
      next.has(posId) ? next.delete(posId) : next.add(posId);
      if (leader) { try { localStorage.setItem(`sdx-copy-done:${leader}`, JSON.stringify([...next])); } catch { /* ignore */ } }
      return next;
    });
  };
  const toggleExpand = (id: number) => setExpanded((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  /* ── live poll ── */
  useEffect(() => {
    if (!leader) return;
    let alive = true;
    const tick = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const [stRes, mkRes] = await Promise.all([
          fetch(`${GW}/perps/accounts/${leader}/state`).then((r) => r.json()),
          fetch(`${GW}/perps/markets/mark-prices`).then((r) => r.json()),
        ]);
        if (!alive) return;
        if (mkRes.code === 0) {
          const m = new Map<string, number>();
          for (const it of mkRes.data ?? []) m.set(it.symbol, parseFloat(it.markPrice));
          setMarks(m);
        }
        if (stRes.code === 0 && stRes.data) {
          const st = stRes.data as AccountState;
          setState(st); setStateErr(false); setLastPoll(Date.now());
          const now = new Map<number, StatePos>();
          for (const p of st.P ?? []) if (Math.abs(parseFloat(p.sz)) > 0) now.set(p.i, p);
          const prev = prevPos.current;
          if (prev) {
            const events: FeedEvent[] = [];
            for (const [id, p] of now) {
              const sz = parseFloat(p.sz);
              const old = prev.get(id);
              if (!old) events.push({ ts: Date.now(), kind: "OPEN", symbol: p.s, isLong: sz > 0, detail: `${Math.abs(sz)} @ ${px(parseFloat(p.ep))} · ${p.l}x` });
              else {
                const oldSz = parseFloat(old.sz);
                if (Math.abs(sz - oldSz) > 1e-9) events.push({ ts: Date.now(), kind: Math.abs(sz) > Math.abs(oldSz) ? "INCREASE" : "REDUCE", symbol: p.s, isLong: sz > 0, detail: `${Math.abs(oldSz)} → ${Math.abs(sz)}` });
              }
            }
            for (const [id, old] of prev) if (!now.has(id)) events.push({ ts: Date.now(), kind: "CLOSE", symbol: old.s, isLong: parseFloat(old.sz) > 0, detail: `closed ${Math.abs(parseFloat(old.sz))}` });
            if (events.length) setFeed((f) => [...events, ...f].slice(0, 50));
          }
          prevPos.current = now;
        } else if (alive) setStateErr(true);
      } catch { if (alive) setStateErr(true); }

      if (myAddr && ADDR_RE.test(myAddr)) {
        try { const r = await fetch(`${GW}/perps/accounts/${myAddr}/state`).then((x) => x.json()); if (alive && r.code === 0 && r.data) setMyState(r.data as AccountState); } catch { /* keep last */ }
      } else if (alive) setMyState(null);
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [leader, myAddr]);

  /* ── once per leader: ranks + overviews + history ── */
  useEffect(() => {
    if (!leader) return;
    let alive = true;
    cachedApiFetch<{ found: boolean; item?: RankItem }>(`${DATA}/leaderboard/rank?window_type=7D&sort_by=pnl&wallet_address=${leader}`).then((d) => alive && d.found && d.item && setRanks((r) => ({ ...r, pnl7: d.item }))).catch(() => {});
    cachedApiFetch<{ found: boolean; item?: RankItem }>(`${DATA}/leaderboard/rank?window_type=ALL_TIME&sort_by=volume&wallet_address=${leader}`).then((d) => alive && d.found && d.item && setRanks((r) => ({ ...r, volAll: d.item }))).catch(() => {});
    return () => { alive = false; };
  }, [leader]);

  useEffect(() => {
    const aid = state?.aid;
    if (!leader || !aid || history !== null) return;
    let alive = true;
    cachedApiFetch<Overview>(`${DATA}/wallet/portfolio/overview?account_id=${aid}&window=7D`).then((d) => alive && setOv7(d)).catch(() => {});
    cachedApiFetch<Overview>(`${DATA}/wallet/portfolio/overview?account_id=${aid}&window=30D`).then((d) => alive && setOv30(d)).catch(() => {});
    cachedApiFetch<HistoryPos[]>(`${DATA}/perps/positions?account_id=${aid}&limit=200`).then((d) => alive && setHistory(d ?? [])).catch(() => alive && setHistory([]));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leader, state?.aid]);

  /* ── TP/SL map: position id → { tp, sl } ── */
  const tpsl = useMemo(() => {
    const m = new Map<number, { tp?: number; sl?: number }>();
    for (const o of state?.O ?? []) {
      const cur = m.get(o.pid) ?? {};
      if (o.st === "TAKE_PROFIT") cur.tp = parseFloat(o.sp);
      else if (o.st === "STOP_LOSS") cur.sl = parseFloat(o.sp);
      m.set(o.pid, cur);
    }
    return m;
  }, [state?.O]);

  /* ── per-market record from the recent 200 ── */
  const marketRecords = useMemo(() => {
    const m = new Map<string, MarketRecord>();
    for (const h of history ?? []) {
      if (parseFloat(h.cum_closed_size) <= 0) continue;
      const name = idToName.get(h.symbol_id);
      if (!name) continue;
      const pnl = parseFloat(h.realized_pnl);
      const rec = m.get(name) ?? { trades: 0, wins: 0, net: 0, avgHoldMs: 0, best: -Infinity, worst: Infinity, recent: [] };
      rec.trades += 1;
      if (pnl > 0) rec.wins += 1;
      rec.net += pnl;
      rec.best = Math.max(rec.best, pnl);
      rec.worst = Math.min(rec.worst, pnl);
      rec.avgHoldMs += Math.max(0, h.updated_at - h.created_at);
      rec.recent.push({ pnl, ts: h.updated_at, lev: h.leverage, isLong: h.position_side === 2 });
      m.set(name, rec);
    }
    for (const rec of m.values()) {
      rec.avgHoldMs = rec.trades ? rec.avgHoldMs / rec.trades : 0;
      rec.recent.sort((a, b) => b.ts - a.ts);
      rec.recent = rec.recent.slice(0, 4);
    }
    return m;
  }, [history, idToName]);

  /* ── vetting ── */
  const vet = useMemo(() => {
    if (!history) return null;
    const closed = history.filter((h) => parseFloat(h.cum_closed_size) > 0);
    if (!closed.length) return { closed: 0, winRate: 0, profitFactor: 0, medianLev: 0, avgHoldMs: 0, lastActive: 0, topSymbols: [] as [string, number][], realized: 0 };
    const wins = closed.filter((h) => parseFloat(h.realized_pnl) > 0);
    const grossWin = wins.reduce((s, h) => s + parseFloat(h.realized_pnl), 0);
    const grossLoss = closed.filter((h) => parseFloat(h.realized_pnl) < 0).reduce((s, h) => s + Math.abs(parseFloat(h.realized_pnl)), 0);
    const levs = closed.map((h) => h.leverage).sort((a, b) => a - b);
    const holds = closed.map((h) => h.updated_at - h.created_at).filter((x) => x > 0);
    const bySym = new Map<string, number>();
    for (const h of closed) { const name = idToName.get(h.symbol_id) ?? `#${h.symbol_id}`; bySym.set(name, (bySym.get(name) ?? 0) + 1); }
    return {
      closed: closed.length,
      winRate: wins.length / closed.length,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
      medianLev: levs[Math.floor(levs.length / 2)] ?? 0,
      avgHoldMs: holds.length ? holds.reduce((a, b) => a + b, 0) / holds.length : 0,
      lastActive: Math.max(...closed.map((h) => h.updated_at)),
      topSymbols: [...bySym.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3),
      realized: closed.reduce((s, h) => s + parseFloat(h.realized_pnl), 0),
    };
  }, [history, idToName]);

  const checklist = useMemo(() => {
    if (!vet || vet.closed === 0) return null;
    return [
      { label: "≥ 30 closed trades on record", ok: vet.closed >= 30 },
      { label: "Traded within the last 24h", ok: Date.now() - vet.lastActive < 86_400_000 },
      { label: "Win rate ≥ 50%", ok: vet.winRate >= 0.5 },
      { label: "Profit factor ≥ 1.2", ok: vet.profitFactor >= 1.2 },
      { label: "Median leverage ≤ 20x", ok: vet.medianLev <= 20 },
    ];
  }, [vet]);

  /* ── mirror plan ── */
  const equity = state ? parseFloat(state.av) || 0 : 0;
  const ratio = equity > 0 ? capital / equity : 0;

  const plan = useMemo(() => {
    if (!state) return [];
    return (state.P ?? [])
      .filter((p) => Math.abs(parseFloat(p.sz)) > 0)
      .map((p) => {
        const sz = parseFloat(p.sz);
        const isLong = sz > 0;
        const qty = Math.abs(sz);
        const mark = marks.get(p.s) ?? 0;
        const entry = parseFloat(p.ep);
        const meta = symbols.get(p.s);
        const step = meta?.stepSize ?? "0.01";
        const minQ = parseFloat(meta?.minQuantity ?? "0");
        const notional = qty * (mark || entry);
        const yourQty = floorToStep(qty * ratio, step);
        const yourNotional = yourQty * (mark || entry);
        const yourMargin = p.l > 0 ? yourNotional / p.l : 0;
        const belowMin = yourQty < minQ || yourQty <= 0;
        const needCapital = qty > 0 && equity > 0 ? (minQ / qty) * equity : 0;
        const marginShare = equity > 0 ? notional / p.l / equity : 0;
        const targets = tpsl.get(p.i) ?? {};
        const ref = mark || entry;
        const tpDist = targets.tp && ref ? (isLong ? targets.tp / ref - 1 : 1 - targets.tp / ref) : null;
        const slDist = targets.sl && ref ? (isLong ? 1 - targets.sl / ref : targets.sl / ref - 1) : null;
        let rr: number | null = null;
        if (targets.tp && targets.sl) {
          const reward = isLong ? targets.tp - entry : entry - targets.tp;
          const risk = isLong ? entry - targets.sl : targets.sl - entry;
          rr = risk > 0 ? reward / risk : null;
        }
        return {
          p, isLong, qty, mark, entry, notional, upnl: parseFloat(p.ur),
          yourQty, yourNotional, yourMargin, belowMin, needCapital,
          liq: mark > 0 ? liqEst(isLong, mark, p.l) : 0, dp: stepDecimals(step),
          highLev: p.l > 25, concentrated: marginShare > 0.4, marginShare,
          heldMs: p.ct ? Date.now() - p.ct : 0,
          tp: targets.tp ?? null, sl: targets.sl ?? null, tpDist, slDist, rr,
          record: marketRecords.get(p.s) ?? null,
        };
      })
      .sort((a, b) => b.notional - a.notional);
  }, [state, marks, symbols, ratio, equity, tpsl, marketRecords]);

  /* ── exposure summary ── */
  const exposure = useMemo(() => {
    if (!plan.length) return null;
    let longN = 0, shortN = 0, yourMargin = 0, protectedCount = 0;
    for (const r of plan) {
      if (r.isLong) longN += r.notional; else shortN += r.notional;
      if (!r.belowMin) yourMargin += r.yourMargin;
      if (r.sl) protectedCount += 1;
    }
    const total = longN + shortN;
    return {
      total,
      net: longN - shortN,
      bias: total > 0 ? (longN - shortN) / total : 0,
      largest: plan[0] ? plan[0].notional / total : 0,
      largestSym: plan[0]?.p.s ?? "",
      yourMargin,
      overCapital: yourMargin > capital,
      protectedPct: plan.length ? protectedCount / plan.length : 0,
      copyable: plan.filter((r) => !r.belowMin).length,
    };
  }, [plan, capital]);

  /* ── drift ── */
  const drift = useMemo(() => {
    if (!myState || !state) return null;
    const mine = new Map<string, number>();
    for (const p of myState.P ?? []) { const sz = parseFloat(p.sz); if (Math.abs(sz) > 0) mine.set(p.s, (mine.get(p.s) ?? 0) + sz); }
    const leaders = new Map<string, number>();
    for (const p of state.P ?? []) { const sz = parseFloat(p.sz); if (Math.abs(sz) > 0) leaders.set(p.s, (leaders.get(p.s) ?? 0) + sz); }
    const missing: { s: string; target: number; isLong: boolean }[] = [];
    const exits: { s: string; mineSz: number }[] = [];
    const mismatch: { s: string; note: string }[] = [];
    for (const [s, lsz] of leaders) {
      const target = Math.abs(lsz) * ratio;
      const m = mine.get(s);
      if (m === undefined) missing.push({ s, target, isLong: lsz > 0 });
      else if (Math.sign(m) !== Math.sign(lsz)) mismatch.push({ s, note: `you are ${m > 0 ? "LONG" : "SHORT"}, leader is ${lsz > 0 ? "LONG" : "SHORT"}` });
      else if (target > 0 && Math.abs(Math.abs(m) - target) / target > 0.15) mismatch.push({ s, note: `size ${Math.abs(m).toFixed(4)} vs target ${target.toFixed(4)}` });
    }
    for (const [s, m] of mine) if (!leaders.has(s)) exits.push({ s, mineSz: m });
    return { missing, exits, mismatch, inSync: !missing.length && !exits.length && !mismatch.length };
  }, [myState, state, ratio]);

  const copyOrder = (row: (typeof plan)[number]) => {
    let txt = `${row.isLong ? "LONG" : "SHORT"} ${row.yourQty.toFixed(row.dp)} ${row.p.s} @ market · ${row.p.l}x · margin ≈ ${usd(row.yourMargin)}`;
    if (row.tp) txt += ` · TP ${px(row.tp)}`;
    if (row.sl) txt += ` · SL ${px(row.sl)}`;
    navigator.clipboard?.writeText(txt).catch(() => {});
    setOrderCopied(row.p.i);
    setTimeout(() => setOrderCopied((v) => (v === row.p.i ? null : v)), 1500);
  };

  const COLS = "24px minmax(120px,1.25fr) 60px 1fr 0.9fr 0.9fr 0.95fr 70px 0.95fr 116px";

  /* ═════════════════════════════ render ═════════════════════════════ */
  return (
    <main>
      <Navbar />
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 pt-24 pb-24">
        {/* header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="tag px-1.5 py-0.5 rounded" style={{ background: "var(--green-tint)", color: "var(--green)", letterSpacing: "0.05em" }}>BETA</span>
            <span className="text-[11px] font-medium" style={{ color: "var(--text-faint)" }}>Assistant only — you place every order yourself. Nothing here is signed or submitted.</span>
          </div>
          <h1 className="text-[28px] sm:text-[34px] font-semibold tracking-tight" style={{ color: "var(--text)" }}>Copy Trading</h1>
          <p className="text-[14px] mt-1.5 max-w-[660px]" style={{ color: "var(--text-muted)" }}>
            Follow any SoDEX trader live. Vet their real track record, mirror their book scaled to your capital with their
            own TP/SL targets, see how they&apos;ve historically traded each market, and track your drift from theirs.
          </p>
        </div>

        {/* ── A: picker + profile ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 mb-3">
          <div className="lg:col-span-2 rounded-[14px] p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center rounded-lg shrink-0" style={{ width: 30, height: 30, background: "var(--bg-elevated)" }}><Users size={15} style={{ color: "var(--text-muted)" }} /></span>
              <div><div className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>Choose a leader</div><div className="tag" style={{ color: "var(--text-faint)" }}>Any SoDEX wallet address</div></div>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && follow(input)} placeholder="0x… wallet address" className="mono flex-1 min-w-0 px-3 py-2 rounded-lg text-[12px] outline-none" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text)" }} />
              <button onClick={() => follow(input)} disabled={!ADDR_RE.test(input.trim())} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold shrink-0" style={{ background: "var(--accent)", color: "var(--accent-fg)", opacity: ADDR_RE.test(input.trim()) ? 1 : 0.4, cursor: ADDR_RE.test(input.trim()) ? "pointer" : "default" }}>Follow</button>
            </div>
            {recent.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap mb-3">
                {recent.map((a) => (<button key={a} onClick={() => follow(a)} className="mono text-[10px] px-2 py-1 rounded-full" style={{ background: leader === a ? "var(--accent)" : "var(--bg-elevated)", color: leader === a ? "var(--accent-fg)" : "var(--text-muted)" }}>{short(a)}</button>))}
              </div>
            )}
            <div className="tag mb-1.5" style={{ color: "var(--text-faint)" }}>TOP 7D PNL · LEADERBOARD</div>
            <div className="flex flex-col gap-1">
              {picks.length === 0 && <div className="mono text-[11px] py-2" style={{ color: "var(--text-faint)" }}>Loading leaders…</div>}
              {picks.map((r) => (
                <button key={r.wallet_address} onClick={() => follow(r.wallet_address)} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-left" style={{ background: leader === r.wallet_address.toLowerCase() ? "var(--bg-elevated)" : "transparent" }} onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)")} onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = leader === r.wallet_address.toLowerCase() ? "var(--bg-elevated)" : "transparent")}>
                  <span className="mono text-[10px] w-6 shrink-0" style={{ color: "var(--text-faint)" }}>#{r.rank}</span>
                  <span className="mono text-[11px] flex-1 truncate" style={{ color: "var(--text)" }}>{short(r.wallet_address)}</span>
                  <span className="mono text-[11px] font-semibold shrink-0" style={{ color: tone(parseFloat(r.pnl_usd)) }}>{parseFloat(r.pnl_usd) >= 0 ? "+" : ""}{usd(parseFloat(r.pnl_usd))}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-3 rounded-[14px] p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
            {!leader ? (
              <div className="h-full min-h-[220px] flex flex-col items-center justify-center gap-2 text-center">
                <Crosshair size={22} style={{ color: "var(--text-faint)" }} />
                <p className="text-[13px] max-w-[300px]" style={{ color: "var(--text-faint)" }}>Paste an address or pick a leaderboard trader to load their live book and track record.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2.5 mb-3 flex-wrap">
                  <span className="flex items-center justify-center rounded-lg shrink-0" style={{ width: 30, height: 30, background: "var(--bg-elevated)" }}><Wallet size={15} style={{ color: "var(--text-muted)" }} /></span>
                  <span className="mono text-[13px] font-semibold" style={{ color: "var(--text)" }}>{short(leader)}</span>
                  {state && !stateErr && (<span className="flex items-center gap-1.5"><span className="live-dot w-1.5 h-1.5 rounded-full" style={{ background: "var(--green)" }} /><span className="tag" style={{ color: "var(--text-faint)" }}>LIVE · {lastPoll ? agoMs(lastPoll) : "…"} · 8s</span></span>)}
                  {stateErr && <span className="tag" style={{ color: "var(--red)" }}>FEED ERROR — retrying</span>}
                  <Link href={`/tracker?address=${leader}`} prefetch={false} className="ml-auto flex items-center gap-1 text-[11px]" style={{ color: "var(--text-faint)" }}>Full tracker <ExternalLink size={11} /></Link>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                  <StatBlock label="EQUITY (LIVE)" value={state ? usd(equity) : "…"} sub={`${plan.length} open position${plan.length === 1 ? "" : "s"}`} />
                  <StatBlock label="7D PNL" value={ov7 ? usd(parseFloat(ov7.total_pnl_usd)) : "…"} color={ov7 ? tone(parseFloat(ov7.total_pnl_usd)) : undefined} sub={ov7 ? `ROI ${(parseFloat(ov7.roi) * 100).toFixed(1)}%` : undefined} />
                  <StatBlock label="30D PNL" value={ov30 ? usd(parseFloat(ov30.total_pnl_usd)) : "…"} color={ov30 ? tone(parseFloat(ov30.total_pnl_usd)) : undefined} sub={ov30 ? `vol ${usd(parseFloat(ov30.volume_usd))}` : undefined} />
                  <StatBlock label="RANKS" value={ranks.pnl7 ? `#${ranks.pnl7.rank} 7D PNL` : "—"} sub={ranks.volAll ? `#${ranks.volAll.rank} all-time volume` : undefined} />
                </div>
                {ov30 && ov30.first_trade_ts_ms > 0 && <div className="mono text-[10px]" style={{ color: "var(--text-faint)" }}>First trade {agoMs(ov30.first_trade_ts_ms)}</div>}
              </>
            )}
          </div>
        </div>

        {leader && (
          <>
            {/* ── B: vetting ── */}
            <div className="rounded-[14px] p-4 mb-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck size={15} style={{ color: "var(--text-muted)" }} />
                <span className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>Track record</span>
                <span className="tag" style={{ color: "var(--text-faint)" }}>LAST {history ? Math.min(history.length, 200) : "…"} POSITIONS · REAL CLOSED TRADES</span>
              </div>
              {history === null ? (
                <div className="h-16 rounded-lg animate-pulse" style={{ background: "var(--bg-elevated)" }} />
              ) : !vet || vet.closed === 0 ? (
                <p className="text-[12px] py-3" style={{ color: "var(--text-faint)" }}>No closed positions on record — nothing to vet yet. Copying an untested account is gambling on faith.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-3">
                    <StatBlock label="WIN RATE" value={`${(vet.winRate * 100).toFixed(0)}%`} color={vet.winRate >= 0.5 ? "var(--green)" : "var(--red)"} sub={`${vet.closed} closed`} />
                    <StatBlock label="PROFIT FACTOR" value={vet.profitFactor === Infinity ? "∞" : vet.profitFactor.toFixed(2)} color={vet.profitFactor >= 1.2 ? "var(--green)" : "var(--text)"} sub="gross win / gross loss" />
                    <StatBlock label="REALIZED PNL" value={usd(vet.realized)} color={tone(vet.realized)} sub="across sample" />
                    <StatBlock label="MEDIAN LEV" value={`${vet.medianLev}x`} color={vet.medianLev > 20 ? "var(--red)" : "var(--text)"} />
                    <StatBlock label="AVG HOLD" value={durFmt(vet.avgHoldMs)} sub={<span className="inline-flex items-center gap-1"><Timer size={9} /> per position</span>} />
                    <StatBlock label="LAST ACTIVE" value={agoMs(vet.lastActive)} color={Date.now() - vet.lastActive < 86_400_000 ? "var(--green)" : "var(--text-muted)"} />
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {checklist?.map((c) => (<span key={c.label} className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px]" style={{ background: "var(--bg-elevated)", color: c.ok ? "var(--green)" : "var(--text-faint)" }}>{c.ok ? <CheckCircle2 size={11} /> : <XCircle size={11} />}{c.label}</span>))}
                    </div>
                    <div className="sm:ml-auto flex items-center gap-2"><span className="tag" style={{ color: "var(--text-faint)" }}>CHECKLIST</span><span className="mono text-[13px] font-bold" style={{ color: (checklist?.filter((c) => c.ok).length ?? 0) >= 4 ? "var(--green)" : "var(--text)" }}>{checklist?.filter((c) => c.ok).length}/5</span></div>
                  </div>
                  {vet.topSymbols.length > 0 && (
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      <span className="tag" style={{ color: "var(--text-faint)" }}>TRADES MOSTLY</span>
                      {vet.topSymbols.map(([s, n]) => (<span key={s} className="flex items-center gap-1.5 px-2 py-1 rounded-full" style={{ background: "var(--bg-elevated)" }}><TokenIcon symbol={s} size={14} /><span className="mono text-[10px] font-semibold" style={{ color: "var(--text)" }}>{tickerLabel(s)}</span><span className="mono text-[9px]" style={{ color: "var(--text-faint)" }}>×{n}</span></span>))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ── C: exposure summary ── */}
            {exposure && (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 mb-3">
                <StatBlock label="OPEN NOTIONAL" value={usd(exposure.total)} sub={`${exposure.copyable}/${plan.length} copyable`} />
                <StatBlock label="NET BIAS" value={`${exposure.bias >= 0 ? "LONG" : "SHORT"} ${Math.abs(exposure.bias * 100).toFixed(0)}%`} color={exposure.bias >= 0 ? "var(--green)" : "var(--red)"} sub={usd(Math.abs(exposure.net)) + " net"} />
                <StatBlock label="TOP POSITION" value={tickerLabel(exposure.largestSym)} sub={`${(exposure.largest * 100).toFixed(0)}% of book`} color={exposure.largest > 0.5 ? "var(--red)" : "var(--text)"} />
                <StatBlock label="PROTECTED" value={`${(exposure.protectedPct * 100).toFixed(0)}%`} color={exposure.protectedPct >= 0.5 ? "var(--green)" : "var(--text-muted)"} sub="have a stop-loss" />
                <StatBlock label="YOUR MARGIN" value={usd(exposure.yourMargin)} color={exposure.overCapital ? "var(--red)" : "var(--text)"} sub={exposure.overCapital ? "exceeds capital" : "to mirror all"} />
                <StatBlock label="YOUR SIZE" value={`${(ratio * 100).toFixed(1)}%`} sub="of leader per position" />
              </div>
            )}

            {/* ── D: mirror plan ── */}
            <div className="rounded-[14px] overflow-hidden mb-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <div className="flex items-center gap-2"><Copy size={15} style={{ color: "var(--text-muted)" }} /><span className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>Mirror plan</span><span className="tag" style={{ color: "var(--text-faint)" }}>TAP A ROW FOR TP/SL & THIS MARKET&apos;S HISTORY</span></div>
                <div className="flex items-center gap-2 sm:ml-auto">
                  <span className="tag" style={{ color: "var(--text-faint)" }}>YOUR CAPITAL</span>
                  <div className="flex items-center rounded-lg px-2" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
                    <span className="mono text-[12px]" style={{ color: "var(--text-faint)" }}>$</span>
                    <input type="number" min={1} value={capital} onChange={(e) => setCapital(Math.max(1, parseFloat(e.target.value) || 0))} className="mono w-24 px-1.5 py-1.5 text-[12.5px] font-semibold bg-transparent outline-none" style={{ color: "var(--text)" }} />
                  </div>
                </div>
              </div>

              {!state ? (
                <div className="p-4"><div className="h-24 rounded-lg animate-pulse" style={{ background: "var(--bg-elevated)" }} /></div>
              ) : plan.length === 0 ? (
                <div className="py-12 text-center"><p className="text-[13px]" style={{ color: "var(--text-faint)" }}>Leader has no open positions right now. The activity feed below will light up the moment they trade.</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <div style={{ minWidth: 900 }}>
                    <div className="grid items-center px-4 py-2" style={{ gridTemplateColumns: COLS, gap: 10, borderBottom: "1px solid var(--border-subtle)" }}>
                      {["", "MARKET", "SIDE", "LEADER SIZE", "ENTRY", "MARK", "U-PNL", "TP/SL", "YOUR SIZE", ""].map((h, i) => (<span key={i} className={`tag ${i > 2 ? "text-right" : ""}`} style={{ color: "var(--text-faint)", fontSize: 8.5 }}>{h}</span>))}
                    </div>
                    {plan.map((row, i) => {
                      const isOpen = expanded.has(row.p.i);
                      return (
                        <div key={row.p.i} style={{ borderBottom: i < plan.length - 1 ? "1px solid var(--border-subtle)" : "none" }}>
                          <div className="grid items-center px-4 cursor-pointer" style={{ gridTemplateColumns: COLS, gap: 10, minHeight: 52, background: isOpen ? "var(--bg-elevated)" : "transparent", transition: "background 0.12s" }} onClick={() => toggleExpand(row.p.i)} onMouseEnter={(e) => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; }} onMouseLeave={(e) => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                            <ChevronDown size={13} style={{ color: "var(--text-faint)", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                            <div className="flex items-center gap-2 min-w-0">
                              <TokenIcon symbol={row.p.s} size={20} />
                              <div className="min-w-0">
                                <div className="mono text-[12px] font-bold truncate" style={{ color: "var(--text)" }}>{tickerLabel(row.p.s)}</div>
                                <div className="mono text-[9px] flex items-center gap-1" style={{ color: "var(--text-faint)" }}>{row.p.l}x · {durFmt(row.heldMs)}{row.highLev && <Flame size={9} style={{ color: "var(--red)" }} />}{row.concentrated && <AlertTriangle size={9} style={{ color: "var(--red)" }} />}</div>
                              </div>
                            </div>
                            <div><SideChip isLong={row.isLong} /></div>
                            <div className="text-right"><div className="mono text-[11.5px] tabular-nums" style={{ color: "var(--text)" }}>{row.qty.toLocaleString("en-US", { maximumFractionDigits: 4 })}</div><div className="mono text-[9px]" style={{ color: "var(--text-faint)" }}>{usd(row.notional)}</div></div>
                            <span className="mono text-[11.5px] text-right tabular-nums" style={{ color: "var(--text-muted)" }}>{px(row.entry)}</span>
                            <span className="mono text-[11.5px] text-right tabular-nums" style={{ color: "var(--text-muted)" }}>{row.mark ? px(row.mark) : "…"}</span>
                            <span className="mono text-[11.5px] text-right font-semibold tabular-nums" style={{ color: tone(row.upnl) }}>{row.upnl >= 0 ? "+" : ""}{usd(row.upnl)}</span>
                            <div className="flex items-center justify-end gap-1">
                              <span title={row.tp ? `Take-profit ${px(row.tp)}` : "No take-profit set"} className="w-1.5 h-1.5 rounded-full" style={{ background: row.tp ? "var(--green)" : "var(--border)" }} />
                              <span title={row.sl ? `Stop-loss ${px(row.sl)}` : "No stop-loss set"} className="w-1.5 h-1.5 rounded-full" style={{ background: row.sl ? "var(--red)" : "var(--border)" }} />
                            </div>
                            <div className="text-right">
                              {row.belowMin ? (<div title={`Below the ${row.p.s} minimum — needs ≥ ${usd(row.needCapital, 0)} capital.`}><div className="mono text-[10.5px] font-semibold" style={{ color: "var(--red)" }}>below min</div><div className="mono text-[9px]" style={{ color: "var(--text-faint)" }}>≥ {usd(row.needCapital, 0)}</div></div>) : (<><div className="mono text-[11.5px] font-bold tabular-nums" style={{ color: "var(--text)" }}>{row.yourQty.toFixed(row.dp)}</div><div className="mono text-[9px]" style={{ color: "var(--text-faint)" }}>{usd(row.yourNotional)} · m {usd(row.yourMargin)}</div></>)}
                            </div>
                            <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <button onClick={() => copyOrder(row)} disabled={row.belowMin} title="Copy order params (incl. TP/SL) to clipboard" className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold" style={{ background: "var(--bg-elevated)", color: row.belowMin ? "var(--text-faint)" : "var(--text)", cursor: row.belowMin ? "default" : "pointer" }}>{orderCopied === row.p.i ? <Check size={11} style={{ color: "var(--green)" }} /> : <Copy size={11} />}{orderCopied === row.p.i ? "copied" : "order"}</button>
                              <button onClick={() => toggleCopied(row.p.i)} title="Mark as copied (local note)" className="w-6 h-6 flex items-center justify-center rounded-md" style={{ background: copied.has(row.p.i) ? "var(--green-tint)" : "var(--bg-elevated)", color: copied.has(row.p.i) ? "var(--green)" : "var(--text-faint)" }}><CheckCircle2 size={12} /></button>
                            </div>
                          </div>

                          {/* expanded detail */}
                          {isOpen && (
                            <div className="px-4 pb-4 pt-1" style={{ background: "var(--bg-elevated)" }}>
                              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                                {/* TP / SL */}
                                <div className="rounded-lg p-3" style={{ background: "var(--bg-surface)" }}>
                                  <div className="tag mb-2" style={{ color: "var(--text-faint)" }}>LEADER&apos;S EXITS · COPY THESE PRICES</div>
                                  <div className="flex flex-col gap-2">
                                    <div className="flex items-center gap-2">
                                      <Target size={12} style={{ color: "var(--green)" }} />
                                      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Take-profit</span>
                                      <span className="mono text-[11.5px] font-semibold ml-auto" style={{ color: row.tp ? "var(--text)" : "var(--text-faint)" }}>{row.tp ? px(row.tp) : "none set"}</span>
                                      {row.tpDist != null && <span className="mono text-[10px]" style={{ color: "var(--green)" }}>{pctRaw(row.tpDist * 100)}</span>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Shield size={12} style={{ color: "var(--red)" }} />
                                      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Stop-loss</span>
                                      <span className="mono text-[11.5px] font-semibold ml-auto" style={{ color: row.sl ? "var(--text)" : "var(--text-faint)" }}>{row.sl ? px(row.sl) : "none set"}</span>
                                      {row.slDist != null && <span className="mono text-[10px]" style={{ color: "var(--red)" }}>{pctRaw(-row.slDist * 100)}</span>}
                                    </div>
                                    <div className="flex items-center gap-2 pt-1 mt-1" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                                      <Scale size={12} style={{ color: "var(--text-faint)" }} />
                                      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Risk / reward</span>
                                      <span className="mono text-[11.5px] font-semibold ml-auto" style={{ color: row.rr == null ? "var(--text-faint)" : row.rr >= 1.5 ? "var(--green)" : row.rr >= 1 ? "var(--text)" : "var(--red)" }}>{row.rr == null ? "—" : `${row.rr.toFixed(2)}R`}</span>
                                    </div>
                                    {row.sl && !row.belowMin && <div className="mono text-[9.5px]" style={{ color: "var(--text-faint)" }}>Your risk to SL ≈ {usd(Math.abs(row.entry - row.sl) * row.yourQty)}</div>}
                                    {!row.tp && !row.sl && <div className="mono text-[9.5px]" style={{ color: "var(--text-faint)" }}>Leader is running this position without protective orders.</div>}
                                  </div>
                                </div>

                                {/* per-market record */}
                                <div className="rounded-lg p-3" style={{ background: "var(--bg-surface)" }}>
                                  <div className="tag mb-2" style={{ color: "var(--text-faint)" }}>LEADER ON {tickerLabel(row.p.s)} · FROM THE 200</div>
                                  {row.record ? (
                                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                                      <Kv k="Trades" v={String(row.record.trades)} />
                                      <Kv k="Win rate" v={`${((row.record.wins / row.record.trades) * 100).toFixed(0)}%`} c={row.record.wins / row.record.trades >= 0.5 ? "var(--green)" : "var(--red)"} />
                                      <Kv k="Net PnL" v={usd(row.record.net)} c={tone(row.record.net)} />
                                      <Kv k="Avg hold" v={durFmt(row.record.avgHoldMs)} />
                                      <Kv k="Best" v={usd(row.record.best)} c="var(--green)" />
                                      <Kv k="Worst" v={usd(row.record.worst)} c="var(--red)" />
                                    </div>
                                  ) : (
                                    <p className="text-[10.5px]" style={{ color: "var(--text-faint)" }}>No closed {tickerLabel(row.p.s)} trades in the recent sample — this is a fresh market for them.</p>
                                  )}
                                </div>

                                {/* recent trades on this market */}
                                <div className="rounded-lg p-3" style={{ background: "var(--bg-surface)" }}>
                                  <div className="tag mb-2" style={{ color: "var(--text-faint)" }}>RECENT {tickerLabel(row.p.s)} TRADES</div>
                                  {row.record?.recent.length ? (
                                    <div className="flex flex-col gap-1.5">
                                      {row.record.recent.map((t, j) => (
                                        <div key={j} className="flex items-center gap-2">
                                          <SideChip isLong={t.isLong} small />
                                          <span className="mono text-[9.5px]" style={{ color: "var(--text-faint)" }}>{t.lev}x</span>
                                          <span className="mono text-[11px] font-semibold ml-auto" style={{ color: tone(t.pnl) }}>{t.pnl >= 0 ? "+" : ""}{usd(t.pnl)}</span>
                                          <span className="mono text-[9px] w-12 text-right" style={{ color: "var(--text-faint)" }}>{agoMs(t.ts)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-[10.5px]" style={{ color: "var(--text-faint)" }}>Nothing closed on this market yet.</p>
                                  )}
                                  <div className="mono text-[9px] mt-2 flex items-center gap-1 justify-end">
                                    <Link href={`/tracker?address=${leader}`} prefetch={false} style={{ color: "var(--text-faint)" }}>full history <ExternalLink size={9} className="inline" /></Link>
                                  </div>
                                </div>
                              </div>

                              {/* simulate on the paper terminal */}
                              <div className="flex items-center gap-2 mt-3 flex-wrap">
                                {row.belowMin ? (
                                  <span className="mono text-[10px]" style={{ color: "var(--text-faint)" }}>Too small to simulate — raise your capital to mirror this position.</span>
                                ) : (
                                  <Link
                                    href={`/trade/${encodeURIComponent(row.p.s)}?copy=1&side=${row.isLong ? "long" : "short"}&margin=${row.yourMargin.toFixed(2)}&lev=${row.p.l}${row.tp ? `&tp=${row.tp}` : ""}${row.sl ? `&sl=${row.sl}` : ""}`}
                                    prefetch={false}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-semibold"
                                    style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
                                  >
                                    <FlaskConical size={12} /> Simulate this trade
                                  </Link>
                                )}
                                <span className="mono text-[9.5px]" style={{ color: "var(--text-faint)" }}>
                                  Opens the paper terminal and auto-fills a {row.isLong ? "LONG" : "SHORT"} {tickerLabel(row.p.s)} at {row.p.l}x with your scaled size{row.tp || row.sl ? " and the leader's TP/SL" : ""} — paper money, no keys.
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <span className="mono text-[9.5px]" style={{ color: "var(--text-faint)" }}>Sizing = leader qty × (capital ÷ leader equity), floored to step size. TP/SL trigger prices are copy-identical (they don&apos;t scale). Execute manually on SoDEX — or rehearse in the</span>
                <Link href="/trade/BTC-USD" className="mono text-[9.5px] underline" style={{ color: "var(--text-muted)" }}>paper terminal</Link>
              </div>
            </div>

            {/* ── E: drift + activity ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="rounded-[14px] p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                <div className="flex items-center gap-2 mb-3"><GitCompareArrows size={15} style={{ color: "var(--text-muted)" }} /><span className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>Copy drift — you vs leader</span></div>
                <div className="flex items-center gap-2 mb-3"><input value={myAddr} onChange={(e) => setMyAddr(e.target.value.trim())} placeholder="Your wallet 0x… (optional)" className="mono flex-1 min-w-0 px-3 py-2 rounded-lg text-[11.5px] outline-none" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text)" }} /></div>
                {!ADDR_RE.test(myAddr) ? (
                  <p className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>Add your own address and every poll compares your live positions against the leader&apos;s: what you haven&apos;t copied, what they&apos;ve exited while you&apos;re still in, and where your sizes have drifted.</p>
                ) : !myState ? (
                  <div className="h-14 rounded-lg animate-pulse" style={{ background: "var(--bg-elevated)" }} />
                ) : drift?.inSync ? (
                  <div className="flex items-center gap-2 rounded-lg px-3 py-2.5" style={{ background: "var(--green-tint)" }}><CheckCircle2 size={14} style={{ color: "var(--green)" }} /><span className="text-[12px]" style={{ color: "var(--text)" }}>In sync — your book matches the leader&apos;s within 15% on every market.</span></div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {drift?.exits.map((e) => (<div key={`x${e.s}`} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "var(--cal-red-tint)" }}><AlertTriangle size={12} style={{ color: "var(--red)", flexShrink: 0 }} /><TokenIcon symbol={e.s} size={16} /><span className="text-[11.5px]" style={{ color: "var(--text)" }}><b>Exit signal</b> — leader closed {tickerLabel(e.s)}, you still hold {Math.abs(e.mineSz).toLocaleString("en-US", { maximumFractionDigits: 4 })}.</span></div>))}
                    {drift?.missing.map((m) => (<div key={`m${m.s}`} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "var(--bg-elevated)" }}><Crosshair size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} /><TokenIcon symbol={m.s} size={16} /><span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>Not copied — leader is <b style={{ color: m.isLong ? "var(--green)" : "var(--red)" }}>{m.isLong ? "LONG" : "SHORT"}</b> {tickerLabel(m.s)} (target ≈ {m.target.toFixed(4)}).</span></div>))}
                    {drift?.mismatch.map((d) => (<div key={`d${d.s}`} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "var(--bg-elevated)" }}><GitCompareArrows size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} /><TokenIcon symbol={d.s} size={16} /><span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>Drift on {tickerLabel(d.s)} — {d.note}.</span></div>))}
                  </div>
                )}
              </div>

              <div className="rounded-[14px] p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                <div className="flex items-center gap-2 mb-3"><Activity size={15} style={{ color: "var(--text-muted)" }} /><span className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>Live activity</span><span className="tag ml-auto flex items-center gap-1" style={{ color: "var(--text-faint)" }}><RefreshCw size={9} /> DETECTED WHILE THIS PAGE IS OPEN</span></div>
                {feed.length === 0 ? (
                  <p className="text-[11.5px] py-2" style={{ color: "var(--text-faint)" }}>Quiet so far. Opens, closes and size changes are detected within ~8 seconds and land here with the exact numbers.</p>
                ) : (
                  <div className="flex flex-col gap-1.5 max-h-[260px] overflow-y-auto pr-1">
                    {feed.map((e, i) => (<div key={`${e.ts}-${i}`} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "var(--bg-elevated)" }}><span className="tag px-1.5 py-0.5 rounded shrink-0" style={{ color: FEED_COLOR[e.kind], border: `1px solid ${FEED_COLOR[e.kind]}`, fontSize: 8 }}>{e.kind}</span><TokenIcon symbol={e.symbol} size={16} /><span className="mono text-[11px] font-semibold shrink-0" style={{ color: "var(--text)" }}>{tickerLabel(e.symbol)}</span><SideChip isLong={e.isLong} small /><span className="mono text-[10.5px] truncate" style={{ color: "var(--text-muted)" }}>{e.detail}</span><span className="mono text-[9px] ml-auto shrink-0" style={{ color: "var(--text-faint)" }}>{agoMs(e.ts)}</span></div>))}
                  </div>
                )}
              </div>
            </div>

            <p className="text-[10px] mt-4 leading-relaxed" style={{ color: "var(--text-faint)" }}>
              All data is live from SoDEX&apos;s public gateway (positions, equity & TP/SL orders every 8s) and the official leaderboard/history APIs.
              The checklist, sizing and per-market stats are transparent arithmetic, not advice. Copy trading real leverage carries real risk — you alone place, manage, and own every order.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function Kv({ k, v, c }: { k: string; v: string; c?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="mono text-[10px]" style={{ color: "var(--text-faint)" }}>{k}</span>
      <span className="mono text-[11px] font-semibold" style={{ color: c ?? "var(--text)" }}>{v}</span>
    </div>
  );
}
