"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

const INVITE_LINK_KEY = "sodex-share-invite-link";
const BG_KEY = "sodex-share-bg";
const ARROWS_KEY = "sodex-share-arrows";
const DEFAULT_INVITE_LINK = "https://sodex.com/join/TRADING";
const SODEX_LOGO = "/sodex-logo.svg";
const SODEX_MARK = "/sodex-mark.svg";

const FONT =
  "var(--font-space-grotesk), 'IBM Plex Sans', system-ui, -apple-system, sans-serif";
const MONO =
  "var(--font-space-mono), ui-monospace, SFMono-Regular, Menlo, monospace";

// Fixed card size — matches the official SoDEX share-card proportions
// (~0.707, portrait). Not user-resizable.
const CARD = { w: 1080, h: 1528 };

// ── Official SoDEX backgrounds. The PNGs are transparent artwork (green
//    up-arrows / red down-arrows) that composite over a coloured base +
//    glow. All assets are local (/public) so html2canvas never taints. ──
interface SodexBg {
  id: "profit" | "loss";
  name: string;
  color: string;
  base: string;
  glow: string;
  img: string;
  anchor: "top" | "bottom";
}

const SODEX_BGS: SodexBg[] = [
  {
    id: "profit",
    name: "Green",
    color: "#35C77F",
    base: "#06180f",
    glow: "radial-gradient(125% 90% at 52% 102%, rgba(53,199,127,0.42), rgba(0,0,0,0) 60%)",
    img: "/profit-bg.png",
    anchor: "bottom",
  },
  {
    id: "loss",
    name: "Red",
    color: "#F0616D",
    base: "#180a0d",
    glow: "radial-gradient(125% 90% at 62% -2%, rgba(240,97,109,0.40), rgba(0,0,0,0) 60%)",
    img: "/loss-bg.png",
    anchor: "top",
  },
];

function sodexBgById(id: string): SodexBg | undefined {
  return SODEX_BGS.find((b) => b.id === id);
}

function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

function formatPrice(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n < 1) return n.toFixed(5);
  if (n < 100) return n.toFixed(4);
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatUsd(n: number): string {
  const abs = Math.abs(n);
  return abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: abs < 1 ? 4 : 2,
  });
}

// ────────────────────────────────────────────────────────────────
//  The rendered card face — rendered twice: once scaled in the live
//  preview, once full-size off-screen as the html2canvas capture source.
// ────────────────────────────────────────────────────────────────
interface FaceProps {
  position: ShareablePosition;
  sbg: SodexBg;
  customBg: string | null;
  showArrows: boolean;
  accent: string;
  isProfit: boolean;
  inviteLink: string;
  qrDataUrl: string;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontSize: 24,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.5)",
          marginBottom: 12,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 40,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function CardFace({
  faceRef,
  position,
  sbg,
  customBg,
  showArrows,
  accent,
  isProfit,
  inviteLink,
  qrDataUrl,
}: FaceProps & { faceRef?: React.Ref<HTMLDivElement> }) {
  const pad = 76;
  const isOpen = position.markPrice != null;
  const secondaryLabel = isOpen ? "Mark Price" : "Exit Price";
  const secondaryValue = position.markPrice ?? position.exitPrice ?? 0;
  const holdDuration = formatDuration(
    (position.updatedAt || Date.now()) - position.createdAt
  );
  const pnlPositive = position.pnl >= 0;

  return (
    <div
      ref={faceRef}
      style={{
        width: CARD.w,
        height: CARD.h,
        position: "relative",
        overflow: "hidden",
        backgroundColor: customBg ? "#000" : sbg.base,
        color: "#fff",
        fontFamily: FONT,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Base background — uploaded image or coloured glow */}
      {customBg ? (
        <img
          src={customBg}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : (
        <div style={{ position: "absolute", inset: 0, background: sbg.glow }} />
      )}

      {/* Arrow overlay — renders over any background, can be toggled off */}
      {showArrows && (
        <img
          src={sbg.img}
          alt=""
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            width: "100%",
            height: "auto",
            opacity: customBg ? 0.82 : 0.9,
            ...(sbg.anchor === "bottom" ? { bottom: 0 } : { top: 0 }),
          }}
        />
      )}

      {/* Readability scrim */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: customBg
            ? "linear-gradient(180deg, rgba(0,0,0,0.60) 0%, rgba(0,0,0,0.32) 42%, rgba(0,0,0,0.78) 100%)"
            : "linear-gradient(180deg, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0) 42%, rgba(0,0,0,0.52) 100%)",
        }}
      />

      {/* Decorative inner frame */}
      <div
        style={{
          position: "absolute",
          inset: 24,
          border: "1.5px solid rgba(255,255,255,0.12)",
          borderRadius: 28,
          pointerEvents: "none",
        }}
      />

      {/* Content */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: pad,
        }}
      >
        {/* Header — official SoDEX logo */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <img
            src={SODEX_LOGO}
            alt="SoDEX"
            style={{ height: 58, width: "auto", display: "block" }}
          />
        </div>

        {/* Hero */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <span
              style={{
                fontSize: 80,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                whiteSpace: "nowrap",
              }}
            >
              {position.symbol}
            </span>
            <span
              style={{
                fontSize: 30,
                fontWeight: 700,
                padding: "10px 22px",
                borderRadius: 10,
                background: "rgba(227,168,90,0.16)",
                border: "1.5px solid rgba(227,168,90,0.55)",
                color: "#E3A85A",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}
            >
              {position.side} {position.leverage}x
            </span>
          </div>

          <div
            style={{
              fontSize: 184,
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: "-0.04em",
              color: accent,
              marginTop: 12,
            }}
          >
            {isProfit ? "+" : ""}
            {position.roiPct.toFixed(2)}%
          </div>

          <div style={{ fontSize: 36, marginTop: 30, color: "rgba(255,255,255,0.75)" }}>
            PnL{" "}
            <span style={{ color: accent, fontWeight: 700 }}>
              {pnlPositive ? "+" : "-"}
              {formatUsd(position.pnl)} USDT
            </span>
          </div>
        </div>

        {/* Stats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 28,
            paddingTop: 32,
            borderTop: "1px solid rgba(255,255,255,0.16)",
          }}
        >
          <Stat label="Entry Price" value={`$${formatPrice(position.entryPrice)}`} />
          <Stat label={secondaryLabel} value={`$${formatPrice(secondaryValue)}`} />
          <Stat label="Hold Duration" value={holdDuration} />
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            paddingTop: 44,
            gap: 24,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 44, fontWeight: 800, marginBottom: 12 }}>
              Trade Now
            </div>
            <div
              style={{
                fontSize: 26,
                color: "rgba(255,255,255,0.62)",
                fontFamily: MONO,
                wordBreak: "break-all",
              }}
            >
              {inviteLink}
            </div>
          </div>
          {qrDataUrl && (
            <div
              style={{
                position: "relative",
                width: 184,
                height: 184,
                flexShrink: 0,
              }}
            >
              <img
                src={qrDataUrl}
                alt="QR"
                style={{
                  width: 184,
                  height: 184,
                  borderRadius: 18,
                  background: "#fff",
                  padding: 12,
                  display: "block",
                }}
              />
              {/* SoDEX cube in the QR centre */}
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  width: 44,
                  height: 44,
                  background: "#fff",
                  borderRadius: 11,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <img
                  src={SODEX_MARK}
                  alt=""
                  style={{ width: 30, height: 30, display: "block" }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
//  Background swatch (Green / Red)
// ────────────────────────────────────────────────────────────────
function BgSwatch({
  bg,
  selected,
  onClick,
}: {
  bg: SodexBg;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={bg.name}
      className="psc-tile relative flex-shrink-0"
      style={{
        borderRadius: 12,
        overflow: "hidden",
        background: bg.base,
        border: selected ? "2px solid var(--accent)" : "1px solid var(--border)",
        boxShadow: selected ? "0 0 0 3px var(--accent-dim)" : "none",
      }}
    >
      <div style={{ position: "absolute", inset: 0, background: bg.glow }} />
      <img
        src={bg.img}
        alt=""
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          width: "100%",
          height: "auto",
          ...(bg.anchor === "bottom" ? { bottom: 0 } : { top: 0 }),
        }}
      />
    </button>
  );
}

// ────────────────────────────────────────────────────────────────
//  Modal
// ────────────────────────────────────────────────────────────────
export function PositionShareCard({
  position,
  onClose,
}: {
  position: ShareablePosition;
  onClose: () => void;
}) {
  const captureRef = useRef<HTMLDivElement>(null);
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isProfit = position.roiPct >= 0;
  const accent = isProfit ? "#35C77F" : "#F0616D";

  const [inviteLink, setInviteLink] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_INVITE_LINK;
    return window.localStorage.getItem(INVITE_LINK_KEY) || DEFAULT_INVITE_LINK;
  });
  const [bgId, setBgId] = useState<"profit" | "loss">(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem(BG_KEY);
      if (saved === "profit" || saved === "loss") return saved;
    }
    return isProfit ? "profit" : "loss";
  });
  const [customBg, setCustomBg] = useState<string | null>(null);
  const [showArrows, setShowArrows] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(ARROWS_KEY) !== "0";
  });
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [box, setBox] = useState({ w: 340, h: 481, scale: 340 / CARD.w });

  const sbg = sodexBgById(bgId) ?? SODEX_BGS[0];
  const qrLink = inviteLink.trim() || DEFAULT_INVITE_LINK;

  // QR code — high error correction so the centre logo stays scannable
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(qrLink, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: "H",
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [qrLink]);

  // Persist preferences
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(INVITE_LINK_KEY, inviteLink);
  }, [inviteLink]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(BG_KEY, bgId);
  }, [bgId]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ARROWS_KEY, showArrows ? "1" : "0");
  }, [showArrows]);

  // Fit the preview to the available width AND height so it stays compact on
  // mobile (where a full-height portrait card would push the controls off-screen).
  useEffect(() => {
    const compute = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const mobile = vw < 640;
      const availW = Math.min(vw - 32, 420);
      const availH = vh * (mobile ? 0.46 : 0.6);
      let w = availW;
      let h = (w * CARD.h) / CARD.w;
      if (h > availH) {
        h = availH;
        w = (h * CARD.w) / CARD.h;
      }
      setBox({ w, h, scale: w / CARD.w });
    };
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("orientationchange", compute);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("orientationchange", compute);
    };
  }, []);

  // Escape to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCustomBg(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const capture = async (): Promise<HTMLCanvasElement | null> => {
    if (!captureRef.current) return null;
    setGenerating(true);
    try {
      return await html2canvas(captureRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: customBg ? "#000000" : sbg.base,
        logging: false,
        width: CARD.w,
        height: CARD.h,
        windowWidth: CARD.w,
        windowHeight: CARD.h,
      });
    } finally {
      setGenerating(false);
    }
  };

  const download = async () => {
    const canvas = await capture();
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${position.symbol}-${position.side}-${position.leverage}x-sodex.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const copy = async () => {
    const canvas = await capture();
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        try {
          await navigator.clipboard.writeText(canvas.toDataURL("image/png"));
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {}
      }
    }, "image/png");
  };

  const faceProps: FaceProps = useMemo(
    () => ({
      position,
      sbg,
      customBg,
      showArrows,
      accent,
      isProfit,
      inviteLink,
      qrDataUrl,
    }),
    [position, sbg, customBg, showArrows, accent, isProfit, inviteLink, qrDataUrl]
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      {/* Off-screen full-resolution capture source */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: 0,
          left: -100000,
          width: CARD.w,
          height: CARD.h,
          pointerEvents: "none",
          opacity: 1,
          zIndex: -1,
        }}
      >
        <CardFace faceRef={captureRef} {...faceProps} />
      </div>

      <style>{`
        .psc-tile { width: 48px; height: 48px; }
        .psc-label { width: 80px; }
        @media (max-width: 639px) {
          .psc-tile { width: 42px; height: 42px; }
          .psc-label { width: 64px; }
        }
      `}</style>

      <div
        className="relative flex flex-col gap-3 sm:gap-4 max-w-[420px] w-full max-h-[94vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 w-8 h-8 flex items-center justify-center rounded-full transition-colors z-10"
          style={{ background: "var(--bg-elevated)", color: "var(--text)" }}
        >
          <X size={16} />
        </button>

        {/* Live preview */}
        <div
          ref={previewWrapRef}
          className="overflow-hidden rounded-2xl shadow-2xl mx-auto shrink-0"
          style={{
            width: box.w,
            height: box.h,
            background: customBg ? "#000" : sbg.base,
          }}
        >
          <div
            style={{
              width: CARD.w,
              height: CARD.h,
              transform: `scale(${box.scale})`,
              transformOrigin: "top left",
            }}
          >
            <CardFace {...faceProps} />
          </div>
        </div>

        {/* Controls */}
        <div
          className="flex flex-col gap-3 sm:gap-4 p-3 sm:p-4"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: 14,
          }}
        >
          {/* Background */}
          <div className="flex items-center gap-2">
            <span
              className="tag text-xs psc-label"
              style={{ color: "var(--text-faint)" }}
            >
              BACKGROUND
            </span>
            <div className="flex-1 flex items-center gap-2">
              {SODEX_BGS.map((b) => (
                <BgSwatch
                  key={b.id}
                  bg={b}
                  selected={!customBg && b.id === bgId}
                  onClick={() => {
                    setCustomBg(null);
                    setBgId(b.id);
                  }}
                />
              ))}
              {/* Upload */}
              <button
                onClick={() => fileRef.current?.click()}
                title="Upload image"
                className="psc-tile flex-shrink-0 flex items-center justify-center transition-colors"
                style={{
                  borderRadius: 12,
                  border: customBg
                    ? "2px solid var(--accent)"
                    : "1px dashed var(--border)",
                  color: customBg ? "var(--accent)" : "var(--text-muted)",
                  background: customBg ? "var(--accent-dim)" : "transparent",
                }}
              >
                <Upload size={16} />
              </button>
              {customBg && (
                <button
                  onClick={() => setCustomBg(null)}
                  title="Remove image"
                  className="psc-tile flex-shrink-0 flex items-center justify-center transition-colors"
                  style={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    color: "var(--text-muted)",
                  }}
                >
                  <X size={16} />
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFile}
              />
            </div>
          </div>

          {/* Arrows toggle */}
          <div className="flex items-center gap-2">
            <span
              className="tag text-xs psc-label"
              style={{ color: "var(--text-faint)" }}
            >
              ARROWS
            </span>
            <button
              onClick={() => setShowArrows((v) => !v)}
              role="switch"
              aria-checked={showArrows}
              className="relative transition-colors"
              style={{
                width: 44,
                height: 24,
                borderRadius: 999,
                background: showArrows ? "var(--accent)" : "var(--border)",
                flexShrink: 0,
              }}
            >
              <span
                className="absolute transition-all"
                style={{
                  top: 2,
                  left: showArrows ? 22 : 2,
                  width: 20,
                  height: 20,
                  borderRadius: 999,
                  background: "var(--bg-surface)",
                }}
              />
            </button>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {showArrows ? "On" : "Off"}
            </span>
          </div>

          {/* Invite link — QR + card update live */}
          <div className="flex items-center gap-2">
            <span
              className="tag text-xs psc-label"
              style={{ color: "var(--text-faint)" }}
            >
              INVITE LINK
            </span>
            <input
              value={inviteLink}
              onChange={(e) => setInviteLink(e.target.value)}
              placeholder={DEFAULT_INVITE_LINK}
              spellCheck={false}
              className="flex-1 bg-transparent outline-none text-sm px-3 py-1.5"
              style={{
                border: "1px solid var(--border)",
                color: "var(--text)",
                borderRadius: 8,
                background: "var(--bg)",
              }}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 mt-0.5">
            <button
              onClick={download}
              disabled={generating}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 sm:py-3 text-sm font-bold transition-colors"
              style={{
                background: "var(--accent)",
                color: "var(--accent-fg)",
                borderRadius: 10,
                opacity: generating ? 0.7 : 1,
              }}
            >
              {generating ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Download size={14} />
              )}
              Download
            </button>
            <button
              onClick={copy}
              disabled={generating}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 sm:py-3 text-sm font-bold transition-colors"
              style={{
                border: "1px solid var(--border)",
                color: copied ? "var(--green)" : "var(--text)",
                background: "var(--bg)",
                borderRadius: 10,
              }}
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
