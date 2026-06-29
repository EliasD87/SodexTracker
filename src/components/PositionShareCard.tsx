"use client";

import { useEffect, useRef, useState } from "react";
import html2canvas from "html2canvas";
import QRCode from "qrcode";
import { Download, Copy, Check, Upload, X, RefreshCw } from "lucide-react";

export interface ShareablePosition {
  symbol: string;
  side: "LONG" | "SHORT";
  leverage: number;
  entryPrice: number;
  markPrice?: number | null;
  exitPrice?: number | null;
  pnl: number;
  roiPct: number;
  createdAt: number;
  updatedAt?: number | null;
}

const INVITE_CODE_KEY = "sodex-share-invite-code";
const DEFAULT_INVITE_CODE = "TRADING";

const PROFIT_BG = "https://sodex.com/assets/profit-bg-Bl4GgV0a.png";
const LOSS_BG = "https://sodex.com/assets/loss-bg-C8QZG0LR.png";
const LOGO_LIGHT = "https://sodex.com/assets/SoDEX_Light-DtsNYtAf.svg";

function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}min`;
  return `${minutes}min`;
}

function formatPrice(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n < 1) return n.toFixed(5);
  if (n < 100) return n.toFixed(4);
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function PositionShareCard({
  position,
  onClose,
}: {
  position: ShareablePosition;
  onClose: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [inviteCode, setInviteCode] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_INVITE_CODE;
    return window.localStorage.getItem(INVITE_CODE_KEY) || DEFAULT_INVITE_CODE;
  });
  const [customBg, setCustomBg] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const isProfit = position.roiPct >= 0;
  const bgUrl = customBg || (isProfit ? PROFIT_BG : LOSS_BG);
  const joinUrl = `https://sodex.com/join/${inviteCode}`;

  const endTime = position.updatedAt || Date.now();
  const holdDuration = formatDuration(endTime - position.createdAt);
  const currentPrice = position.markPrice ?? position.exitPrice ?? 0;

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(joinUrl, { width: 180, margin: 1, color: { dark: "#000000", light: "#ffffff" } })
      .then((url) => { if (!cancelled) setQrDataUrl(url); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [joinUrl]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(INVITE_CODE_KEY, inviteCode);
  }, [inviteCode]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCustomBg(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const resetBg = () => setCustomBg(null);

  const capture = async (): Promise<HTMLCanvasElement | null> => {
    if (!cardRef.current) return null;
    setGenerating(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        logging: false,
      });
      return canvas;
    } finally {
      setGenerating(false);
    }
  };

  const download = async () => {
    const canvas = await capture();
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${position.symbol}-${position.side}-${position.leverage}x-share.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const copy = async () => {
    const canvas = await capture();
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        // Fallback: copy data URL as text
        try {
          await navigator.clipboard.writeText(canvas.toDataURL("image/png"));
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {}
      }
    }, "image/png");
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="relative flex flex-col gap-4 max-w-[420px] w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 w-8 h-8 flex items-center justify-center rounded-full transition-colors"
          style={{ background: "var(--bg-elevated)", color: "var(--text)" }}
        >
          <X size={16} />
        </button>

        {/* Preview card (scaled down for display) */}
        <div
          className="w-full overflow-hidden rounded-lg shadow-2xl"
          style={{ aspectRatio: "9/16", background: "#000" }}
        >
          <div
            ref={cardRef}
            style={{
              width: 1080,
              height: 1920,
              position: "relative",
              overflow: "hidden",
              backgroundColor: isProfit ? "#0a1f15" : "#1a0a0a",
              color: "#fff",
              fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif",
              transform: "scale(0.35)",
              transformOrigin: "top left",
            }}
          >
            {/* Background image */}
            <img
              src={bgUrl}
              alt=""
              crossOrigin="anonymous"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                opacity: 0.85,
              }}
            />

            {/* Dark overlay gradient for readability */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.45) 100%)",
              }}
            />

            {/* Logo */}
            <div style={{ position: "absolute", top: 64, left: 64, display: "flex", alignItems: "center", gap: 18 }}>
              <img src={LOGO_LIGHT} alt="SoDEX" crossOrigin="anonymous" style={{ width: 80, height: 80 }} />
              <span style={{ fontSize: 52, fontWeight: 800, letterSpacing: "-0.02em", color: "#fff" }}>SoDEX</span>
            </div>

            {/* Main content */}
            <div style={{ position: "absolute", left: 64, right: 64, top: "42%", transform: "translateY(-50%)" }}>
              {/* Symbol + badge */}
              <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 32 }}>
                <span style={{ fontSize: 72, fontWeight: 800, letterSpacing: "-0.02em" }}>{position.symbol}</span>
                <span
                  style={{
                    fontSize: 32,
                    fontWeight: 700,
                    padding: "10px 22px",
                    borderRadius: 8,
                    border: `2px solid ${isProfit ? "#35C77F" : "#F0616D"}`,
                    color: isProfit ? "#35C77F" : "#F0616D",
                    textTransform: "uppercase",
                  }}
                >
                  {position.side} {position.leverage}x
                </span>
              </div>

              {/* Big percentage */}
              <div
                style={{
                  fontSize: 180,
                  fontWeight: 800,
                  lineHeight: 1,
                  letterSpacing: "-0.03em",
                  color: isProfit ? "#35C77F" : "#F0616D",
                  marginBottom: 48,
                }}
              >
                {isProfit ? "+" : ""}{position.roiPct.toFixed(2)}%
              </div>

              {/* Stats grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 36 }}>
                <div>
                  <div style={{ fontSize: 30, color: "rgba(255,255,255,0.55)", marginBottom: 8 }}>Entry Price</div>
                  <div style={{ fontSize: 42, fontWeight: 700 }}>${formatPrice(position.entryPrice)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 30, color: "rgba(255,255,255,0.55)", marginBottom: 8 }}>Mark Price</div>
                  <div style={{ fontSize: 42, fontWeight: 700 }}>${currentPrice > 0 ? formatPrice(currentPrice) : "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 30, color: "rgba(255,255,255,0.55)", marginBottom: 8 }}>Hold Duration</div>
                  <div style={{ fontSize: 42, fontWeight: 700 }}>{holdDuration}</div>
                </div>
              </div>
            </div>

            {/* Bottom bar */}
            <div style={{ position: "absolute", left: 64, right: 64, bottom: 64, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 44, fontWeight: 800, marginBottom: 8 }}>Trade Now</div>
                <div style={{ fontSize: 30, color: "rgba(255,255,255,0.65)", fontFamily: "monospace" }}>{joinUrl}</div>
              </div>
              {qrDataUrl && (
                <img
                  src={qrDataUrl}
                  alt="QR"
                  style={{ width: 180, height: 180, borderRadius: 16, background: "#fff", padding: 10 }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div
          className="flex flex-col gap-3 p-4"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12 }}
        >
          <div className="flex items-center gap-2">
            <span className="tag text-xs" style={{ color: "var(--text-faint)" }}>INVITE CODE</span>
            <input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.trim().toUpperCase())}
              className="flex-1 bg-transparent outline-none text-sm px-2 py-1"
              style={{ border: "1px solid var(--border)", color: "var(--text)", borderRadius: 6, background: "var(--bg)" }}
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="tag text-xs" style={{ color: "var(--text-faint)" }}>BACKGROUND</span>
            <button
              onClick={() => setCustomBg(null)}
              className="px-2 py-1 text-xs font-bold transition-colors"
              style={{
                border: "1px solid var(--border)",
                borderRadius: 6,
                background: customBg ? "transparent" : "var(--accent-dim)",
                color: customBg ? "var(--text-muted)" : "var(--accent)",
              }}
            >
              Default
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1 px-2 py-1 text-xs font-bold transition-colors"
              style={{ border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-muted)" }}
            >
              <Upload size={12} />
              Custom
            </button>
            {customBg && (
              <button
                onClick={resetBg}
                className="flex items-center gap-1 px-2 py-1 text-xs font-bold transition-colors"
                style={{ border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-muted)" }}
              >
                <X size={12} />
                Clear
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </div>

          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={download}
              disabled={generating}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold transition-colors"
              style={{ background: "var(--accent)", color: "var(--accent-fg)", borderRadius: 8 }}
            >
              {generating ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
              Download
            </button>
            <button
              onClick={copy}
              disabled={generating}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold transition-colors"
              style={{ border: "1px solid var(--border)", color: copied ? "var(--green)" : "var(--text)", background: "var(--bg)", borderRadius: 8 }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
