"use client";

import { useEffect, useState, useRef } from "react";
import { X } from "lucide-react";
import { PairIcon } from "@/components/TopPairs";

interface Kline {
  t: number;
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
  q: string;
  x?: boolean;
}

interface OrderBook {
  bids: [string, string][];
  asks: [string, string][];
}

interface Trade {
  p: string;
  q: string;
  T: number;
  S: string;
}

type Tab = "chart" | "orderbook" | "trades";

const INTERVALS = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"] as const;
type Interval = (typeof INTERVALS)[number];

const PERPS = "https://mainnet-gw.sodex.dev/api/v1/perps";
const WS_PERPS = "wss://mainnet-gw.sodex.dev/ws/perps";

function fmtPrice(s: string | number): string {
  const p = typeof s === "string" ? parseFloat(s) : s;
  if (!p) return "—";
  if (p >= 10_000) return "$" + p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 100) return "$" + p.toFixed(2);
  if (p >= 1) return "$" + p.toFixed(4);
  return "$" + p.toFixed(6);
}

function fmtQty(s: string | number): string {
  const q = typeof s === "string" ? parseFloat(s) : s;
  if (q >= 1_000_000) return (q / 1_000_000).toFixed(2) + "M";
  if (q >= 1_000) return (q / 1_000).toFixed(2) + "K";
  return q.toFixed(4);
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", { hour12: false });
}

export function PairAnalysisModal({
  symbol,
  onClose,
}: {
  symbol: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("chart");
  const [interval, setInterval] = useState<Interval>("1h");
  const [klines, setKlines] = useState<Kline[]>([]);
  const [orderbook, setOrderbook] = useState<OrderBook | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);

  // Initial REST fetch for klines (historical), then WS for live updates
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`${PERPS}/markets/${symbol}/klines?interval=${interval}&limit=200`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const data: Kline[] = (json?.data ?? []).map((k: Kline) => ({
          t: k.t, o: k.o, h: k.h, l: k.l, c: k.c, v: k.v, q: k.q, x: k.x,
        }));
        setKlines(data);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbol, interval]);

  // Initial REST fetch for orderbook + trades, then WS for live updates
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`${PERPS}/markets/${symbol}/orderbook?limit=20`).then((r) => r.json()),
      fetch(`${PERPS}/markets/${symbol}/trades?limit=50`).then((r) => r.json()),
    ])
      .then(([ob, tr]) => {
        if (cancelled) return;
        if (ob?.data) {
          setOrderbook({ bids: ob.data.bids ?? [], asks: ob.data.asks ?? [] });
        }
        if (tr?.data) {
          setTrades(tr.data.map((t: Trade) => ({ p: t.p, q: t.q, T: t.T, S: t.S })).slice(0, 50));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [symbol]);

  // WebSocket for live updates: candle, l2Book, trade
  // Reconnects when symbol or interval changes
  useEffect(() => {
    const ws = new WebSocket(WS_PERPS);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ op: "subscribe", params: { channel: "candle", symbol, interval } }));
      ws.send(JSON.stringify({ op: "subscribe", params: { channel: "l2Book", symbol } }));
      ws.send(JSON.stringify({ op: "subscribe", params: { channel: "trade", symbols: [symbol] } }));
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.channel === "candle" && msg.type === "update" && msg.data) {
          const candle: Kline = msg.data;
          // Update last candle if same timestamp, otherwise append
          setKlines((prev) => {
            if (prev.length === 0) return [candle];
            const last = prev[prev.length - 1];
            if (last.t === candle.t) {
              const next = [...prev];
              next[next.length - 1] = candle;
              return next;
            }
            // New candle — append and trim to 200
            return [...prev, candle].slice(-200);
          });
        } else if (msg.channel === "l2Book" && msg.type === "snapshot" && msg.data) {
          setOrderbook({ bids: msg.data.b ?? [], asks: msg.data.a ?? [] });
        } else if (msg.channel === "trade" && msg.type === "update" && msg.data) {
          const newTrades: Trade[] = msg.data.map((t: Trade) => ({ p: t.p, q: t.q, T: t.T, S: t.S }));
          setTrades((prev) => [...newTrades, ...prev].slice(0, 50));
        }
      } catch {}
    };

    ws.onerror = () => {};

    return () => {
      try {
        ws.send(JSON.stringify({ op: "unsubscribe", params: { channel: "candle", symbol, interval } }));
        ws.send(JSON.stringify({ op: "unsubscribe", params: { channel: "l2Book", symbol } }));
        ws.send(JSON.stringify({ op: "unsubscribe", params: { channel: "trade", symbols: [symbol] } }));
      } catch {}
      ws.close();
      wsRef.current = null;
    };
  }, [symbol, interval]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const lastPrice = klines.length > 0 ? parseFloat(klines[klines.length - 1].c) : 0;
  const firstPrice = klines.length > 0 ? parseFloat(klines[0].o) : 0;
  const changePct = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-[92vw] max-w-[900px] max-h-[85vh] flex flex-col overflow-hidden"
        style={{
          background: "var(--panel-bg)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid var(--panel-border)",
          borderRadius: "var(--r-card)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center gap-3">
            <PairIcon symbol={symbol} size={32} />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold mono" style={{ color: "var(--text)" }}>{symbol}</span>
                <span className="flex items-center gap-1 text-[9px] mono tracking-widest" style={{ color: "var(--accent)" }}>
                  <span className="live-dot w-1.5 h-1.5 rounded-full" style={{ background: "var(--accent)" }} />
                  LIVE
                </span>
              </div>
              {lastPrice > 0 && (
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="mono text-sm font-bold" style={{ color: "var(--text)" }}>{fmtPrice(lastPrice)}</span>
                  <span
                    className="mono text-[11px] font-medium px-1.5 py-0.5"
                    style={{
                      color: changePct >= 0 ? "var(--green)" : "var(--red)",
                      background: changePct >= 0 ? "var(--green-tint)" : "var(--cal-red-tint)",
                      borderRadius: 999,
                    }}
                  >
                    {changePct >= 0 ? "▲" : "▼"} {Math.abs(changePct).toFixed(2)}%
                  </span>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="transition-opacity"
            style={{ color: "var(--text-faint)", cursor: "pointer" }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.6")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-5 py-2.5" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          {(["chart", "orderbook", "trades"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-3 py-1.5 rounded-lg text-[12.5px] font-medium transition-colors"
              style={{
                background: tab === t ? "var(--accent-dim)" : "transparent",
                color: tab === t ? "var(--accent)" : "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              {t === "chart" ? "Chart" : t === "orderbook" ? "Order book" : "Trades"}
            </button>
          ))}
          {tab === "chart" && (
            <div className="flex items-center gap-0.5 ml-auto">
              {INTERVALS.map((iv) => (
                <button
                  key={iv}
                  onClick={() => setInterval(iv)}
                  className="px-2 py-1 rounded-md mono text-[11px] transition-colors"
                  style={{
                    background: interval === iv ? "var(--bg-elevated)" : "transparent",
                    color: interval === iv ? "var(--text)" : "var(--text-faint)",
                    cursor: "pointer",
                  }}
                >
                  {iv}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1" style={{ minHeight: 300, maxHeight: "85vh", overflow: "hidden" }}>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex items-end gap-1.5" style={{ height: 60 }}>
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-2 rounded-sm animate-pulse"
                    style={{ height: `${30 + ((i * 37) % 70)}%`, background: "var(--border)", animationDelay: `${i * 40}ms` }}
                  />
                ))}
              </div>
            </div>
          ) : tab === "chart" ? (
            <KlineChart klines={klines} />
          ) : tab === "orderbook" ? (
            <OrderBookView data={orderbook} />
          ) : (
            <TradesView trades={trades} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Kline Chart (candlestick SVG) ── */
function KlineChart({ klines }: { klines: Kline[] }) {
  if (klines.length === 0)
    return <div className="py-20 text-center mono text-sm" style={{ color: "var(--text-faint)" }}>No kline data</div>;

  const W = 860;
  const H = 360;
  const PAD = { l: 50, r: 10, t: 10, b: 28 };
  const PLOT_W = W - PAD.l - PAD.r;
  const PLOT_H = H - PAD.t - PAD.b;

  const highs = klines.map((k) => parseFloat(k.h));
  const lows = klines.map((k) => parseFloat(k.l));
  const yMax = Math.max(...highs) * 1.01;
  const yMin = Math.min(...lows) * 0.99;
  const range = yMax - yMin || 1;

  const x = (i: number) => PAD.l + (i / (klines.length - 1)) * PLOT_W;
  const y = (v: number) => PAD.t + (1 - (v - yMin) / range) * PLOT_H;
  const cw = Math.max(2, (PLOT_W / klines.length) * 0.6);

  const gridVals = Array.from({ length: 5 }, (_, i) => yMin + (range / 4) * i);

  const xLabels = klines
    .map((k, i) => ({ i, t: k.t }))
    .filter((_, i) => i % Math.ceil(klines.length / 6) === 0);

  return (
    <div className="p-3">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", height: "auto", aspectRatio: `${W} / ${H}` }}>
        {/* Y gridlines */}
        {gridVals.map((v, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--border-subtle)" strokeWidth={1} strokeDasharray="3 4" opacity={0.4} />
            <text x={PAD.l - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill="var(--text-faint)" className="mono">
              {fmtPrice(v)}
            </text>
          </g>
        ))}

        {/* X labels */}
        {xLabels.map(({ i, t }) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--text-faint)" className="mono">
            {new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </text>
        ))}

        {/* Candles */}
        {klines.map((k, i) => {
          const o = parseFloat(k.o);
          const h = parseFloat(k.h);
          const l = parseFloat(k.l);
          const c = parseFloat(k.c);
          const up = c >= o;
          const color = up ? "var(--green)" : "var(--red)";
          const bodyTop = y(Math.max(o, c));
          const bodyBot = y(Math.min(o, c));
          const bodyH = Math.max(1, bodyBot - bodyTop);
          return (
            <g key={i}>
              <line x1={x(i)} x2={x(i)} y1={y(h)} y2={y(l)} stroke={color} strokeWidth={1} />
              <rect
                x={x(i) - cw / 2}
                y={bodyTop}
                width={cw}
                height={bodyH}
                fill={color}
                opacity={up ? 0.7 : 0.8}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ── Order Book View ── */
function OrderBookView({ data }: { data: OrderBook | null }) {
  if (!data || (!data.bids?.length && !data.asks?.length))
    return <div className="py-20 text-center mono text-sm" style={{ color: "var(--text-faint)" }}>No order book data</div>;

  const asks = (data.asks ?? []).slice(0, 8).reverse();
  const bids = (data.bids ?? []).slice(0, 8);
  const maxQty = Math.max(
    ...asks.map((a) => parseFloat(a[1])),
    ...bids.map((b) => parseFloat(b[1])),
    1
  );

  const bestAsk = asks.length > 0 ? parseFloat(asks[asks.length - 1][0]) : 0;
  const bestBid = bids.length > 0 ? parseFloat(bids[0][0]) : 0;
  const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;
  const spreadPct = bestBid > 0 ? (spread / bestBid) * 100 : 0;
  const midPrice = bestAsk > 0 && bestBid > 0 ? (bestAsk + bestBid) / 2 : 0;

  const Row = ({ price, qty, side }: { price: string; qty: string; side: "ask" | "bid" }) => {
    const pct = (parseFloat(qty) / maxQty) * 100;
    const isAsk = side === "ask";
    const color = isAsk ? "var(--red)" : "var(--green)";
    const bgColor = isAsk ? "var(--cal-red-tint)" : "var(--green-tint)";
    const borderColor = isAsk ? "var(--cal-red-edge)" : "var(--green-edge)";
    return (
      <div className="relative flex items-center justify-between px-5 py-[3px] group/ob-row" style={{ transition: "background 0.1s" }}>
        <div
          className="absolute right-0 top-0 bottom-0"
          style={{ width: `${pct}%`, background: bgColor, transition: "width 0.3s ease" }}
        />
        <div
          className="absolute right-0 top-0 bottom-0"
          style={{ width: 2, background: borderColor, opacity: pct > 15 ? 0.6 : 0.2 }}
        />
        <span className="relative mono text-xs font-medium" style={{ color }}>{fmtPrice(price)}</span>
        <span className="relative mono text-xs" style={{ color: "var(--text-muted)" }}>{fmtQty(qty)}</span>
      </div>
    );
  };

  return (
    <div className="px-5 py-3">
      <div className="flex items-center justify-between text-[9px] mono tracking-widest mb-2 pb-2" style={{ color: "var(--text-faint)", borderBottom: "1px solid var(--border-subtle)" }}>
        <span>PRICE</span>
        <span>QUANTITY</span>
        <span>TOTAL</span>
      </div>

      {/* Asks */}
      <div className="flex flex-col">
        {asks.map((a, i) => {
          const cumulative = asks.slice(i).reduce((sum, [, q]) => sum + parseFloat(q), 0);
          return (
            <div key={`a-${i}`} className="relative">
              <Row price={a[0]} qty={a[1]} side="ask" />
              <span className="absolute right-5 top-0 bottom-0 flex items-center mono text-[10px]" style={{ color: "var(--text-faint)", opacity: 0.5 }}>
                {fmtQty(cumulative)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Spread / mid price divider */}
      <div
        className="flex items-center justify-center gap-3 my-1.5 py-1.5"
        style={{
          borderTop: "1px solid var(--border-subtle)",
          borderBottom: "1px solid var(--border-subtle)",
          background: "var(--bg-elevated)",
        }}
      >
        <span className="mono text-sm font-bold" style={{ color: "var(--text)" }}>{fmtPrice(midPrice)}</span>
        <span className="mono text-[10px]" style={{ color: "var(--text-faint)" }}>
          Spread: <span style={{ color: "var(--text-muted)" }}>{fmtPrice(spread)}</span> ({spreadPct.toFixed(4)}%)
        </span>
      </div>

      {/* Bids */}
      <div className="flex flex-col">
        {bids.map((b, i) => {
          const cumulative = bids.slice(0, i + 1).reduce((sum, [, q]) => sum + parseFloat(q), 0);
          return (
            <div key={`b-${i}`} className="relative">
              <Row price={b[0]} qty={b[1]} side="bid" />
              <span className="absolute right-5 top-0 bottom-0 flex items-center mono text-[10px]" style={{ color: "var(--text-faint)", opacity: 0.5 }}>
                {fmtQty(cumulative)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Trades View ── */
function TradesView({ trades }: { trades: Trade[] }) {
  if (trades.length === 0)
    return <div className="py-20 text-center mono text-sm" style={{ color: "var(--text-faint)" }}>No recent trades</div>;

  return (
    <div className="px-5 py-3" style={{ maxHeight: 400, overflowY: "auto" }}>
      <div
        className="grid items-center text-[10px] mono tracking-widest mb-2"
        style={{ gridTemplateColumns: "1fr 1fr 1fr", color: "var(--text-faint)" }}
      >
        <span>PRICE</span>
        <span className="text-right">QUANTITY</span>
        <span className="text-right">TIME</span>
      </div>
      <div className="flex flex-col">
        {trades.map((t, i) => {
          const isBuy = t.S === "BUY";
          return (
            <div
              key={i}
              className="grid items-center py-1.5"
              style={{ gridTemplateColumns: "1fr 1fr 1fr", borderTop: i > 0 ? "1px solid var(--border-subtle)" : undefined }}
            >
              <span className="mono text-xs font-medium" style={{ color: isBuy ? "var(--green)" : "var(--red)" }}>
                {fmtPrice(t.p)}
              </span>
              <span className="mono text-xs text-right" style={{ color: "var(--text-muted)" }}>
                {fmtQty(t.q)}
              </span>
              <span className="mono text-xs text-right" style={{ color: "var(--text-faint)" }}>
                {fmtTime(t.T)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
