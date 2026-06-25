"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { toPng } from "html-to-image";
import {
  Gem,
  Crown,
  Shield,
  Medal,
  Download,
  Upload,
  Trash2,
  Type,
  Palette,
  Image as ImageIcon,
  Sparkles,
  CalendarDays,
  Sigma,
} from "lucide-react";

/* ──────────────────────────────────────────────────────────────
   Tier definitions — each tier has its own gradient + icon
   ────────────────────────────────────────────────────────────── */
type TierKey = "bronze" | "silver" | "gold" | "diamond" | "epic";
type CardType = "total" | "weekly";

type TierConfig = {
  key: TierKey;
  label: string;
  gradient: string;
  /** subtle top-left sheen for depth */
  sheen: string;
  icon: React.ElementType;
  /** per-icon visual-size multiplier so every glyph reads the same size */
  iconScale: number;
  /** swatch shown in the tier picker */
  swatch: string;
  /** optional texture layer (e.g. the dotted grain on the Epic card) */
  pattern?: React.CSSProperties;
};

const TIERS: Record<TierKey, TierConfig> = {
  bronze: {
    key: "bronze",
    label: "BRONZE",
    gradient: "linear-gradient(150deg, #cf935f 0%, #a86a3a 52%, #834f28 100%)",
    sheen: "radial-gradient(120% 110% at 12% 0%, rgba(255,255,255,0.18), transparent 52%)",
    icon: Medal,
    iconScale: 0.98,
    swatch: "#b27542",
  },
  silver: {
    key: "silver",
    label: "SILVER",
    gradient: "linear-gradient(150deg, #aab4c1 0%, #8089a0 55%, #69707f 100%)",
    sheen: "radial-gradient(120% 110% at 12% 0%, rgba(255,255,255,0.24), transparent 52%)",
    icon: Shield,
    iconScale: 0.95,
    swatch: "#8b95a6",
  },
  gold: {
    key: "gold",
    label: "GOLD",
    gradient: "linear-gradient(150deg, #f0c233 0%, #d6a31d 50%, #b5840f 100%)",
    sheen: "radial-gradient(120% 110% at 12% 0%, rgba(255,255,255,0.28), transparent 52%)",
    icon: Crown,
    iconScale: 1.12,
    swatch: "#dca81f",
  },
  diamond: {
    key: "diamond",
    label: "DIAMOND",
    gradient: "linear-gradient(150deg, #8482ee 0%, #6663d6 52%, #524ac2 100%)",
    sheen: "radial-gradient(120% 110% at 12% 0%, rgba(255,255,255,0.22), transparent 52%)",
    icon: Gem,
    iconScale: 0.9,
    swatch: "#6a67d8",
  },
  epic: {
    key: "epic",
    label: "EPIC",
    gradient: "radial-gradient(125% 145% at 50% -12%, #2b2b30 0%, #161618 40%, #0a0a0b 100%)",
    sheen: "radial-gradient(120% 110% at 12% 0%, rgba(255,255,255,0.05), transparent 50%)",
    icon: Crown,
    iconScale: 1.12,
    swatch: "#161618",
    pattern: {
      backgroundImage: "radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1.3px)",
      backgroundSize: "13px 13px",
    },
  },
};

type BgMode = "tier" | "solid" | "image";

/* format an arbitrary string of digits with thousands separators */
function formatNumber(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("en-US");
}

/* ──────────────────────────────────────────────────────────────
   SoDEX wordmark — official logo (orange cube + white wordmark)
   ────────────────────────────────────────────────────────────── */
function SodexMark() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/sodex-logo.svg"
      alt="SoDEX"
      style={{ width: "22%", maxWidth: 150, height: "auto", display: "block" }}
    />
  );
}

/* ══════════════════════════════════════════════════════════════
   The editor
   ══════════════════════════════════════════════════════════════ */
export function SoPointsEditor() {
  const cardRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── content fields ──
  const [tier, setTier] = useState<TierKey>("diamond");
  const [cardType, setCardType] = useState<CardType>("total");
  const [week, setWeek] = useState("20");
  const [points, setPoints] = useState("15,301");
  const [percentile, setPercentile] = useState("TOP 0.04% GLOBALLY");
  const [url, setUrl] = useState("sodex.com/join/trading");
  const [showQR, setShowQR] = useState(true);

  // weekly cards show a "MY WEEK n SOPOINTS" label and a "+" gain prefix;
  // total cards show "MY SOPOINTS" with the raw amount.
  const isWeekly = cardType === "weekly";
  const pointsLabel = isWeekly ? `MY WEEK ${week || "1"} SOPOINTS` : "MY SOPOINTS";
  const showPlus = isWeekly;

  // ── background ──
  const [bgMode, setBgMode] = useState<BgMode>("tier");
  const [solidColor, setSolidColor] = useState("#5b21b6");
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [overlay, setOverlay] = useState(0.55);

  // ── derived ──
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const cfg = TIERS[tier];
  const Icon = cfg.icon;

  /* Generate a QR code from the URL (fetched as a data URL so export never
     taints the canvas with a cross-origin image). */
  useEffect(() => {
    const clean = url.trim();
    if (!clean) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const target = clean.startsWith("http") ? clean : `https://${clean}`;
        const api = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=0&qzone=1&data=${encodeURIComponent(
          target
        )}`;
        const res = await fetch(api);
        const blob = await res.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          if (!cancelled) setQrDataUrl(reader.result as string);
        };
        reader.readAsDataURL(blob);
      } catch {
        if (!cancelled) setQrDataUrl(null);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [url]);

  const onUpload = (file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setBgImage(reader.result as string);
      setBgMode("image");
    };
    reader.readAsDataURL(file);
  };

  const download = useCallback(async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 3,
        cacheBust: true,
      });
      const a = document.createElement("a");
      a.download = `sopoints-${tier}-${cardType}.png`;
      a.href = dataUrl;
      a.click();
    } finally {
      setDownloading(false);
    }
  }, [tier, cardType]);

  /* the card background, depending on the chosen mode */
  const cardBackground =
    bgMode === "solid" ? solidColor : bgMode === "image" ? "#0b0b0b" : cfg.gradient;

  const displayPoints = `${showPlus ? "+" : ""}${points || "0"}`;

  return (
    <div className="min-h-screen pt-[60px] sm:pt-[72px] pb-20 sm:pb-24" style={{ background: "var(--bg)" }}>
      <div className="max-w-[1100px] mx-auto px-4 sm:px-5">
        {/* ── header ── */}
        <div className="pt-4 sm:pt-6">
          <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
            <span className="w-5 h-px" style={{ background: "var(--accent)" }} />
            <span className="tag" style={{ color: "var(--accent)" }}>
              SOPOINTS · CARD STUDIO
            </span>
          </div>
          <h1
            className="text-[21px] sm:text-[40px] font-bold leading-none tracking-tight"
            style={{ color: "var(--text)", letterSpacing: "-0.02em" }}
          >
            Design your SoPoints card
          </h1>
          <p className="mt-2 sm:mt-3 text-[12.5px] sm:text-sm max-w-xl hidden sm:block" style={{ color: "var(--text-muted)" }}>
            Pick a tier, edit every label, swap the background for a solid colour or your own
            image, then export a share-ready PNG.
          </p>
        </div>

        <div className="grid lg:grid-cols-[1fr_360px] gap-4 sm:gap-8 mt-4 sm:mt-8 items-start">
          {/* ════════ LIVE PREVIEW ════════ */}
          <div className="lg:sticky lg:top-[80px]">
            <div
              ref={cardRef}
              className="relative w-full overflow-hidden select-none"
              style={{
                aspectRatio: "1.9 / 1",
                borderRadius: 22,
                background: cardBackground,
                color: "#fff",
                boxShadow: "0 24px 60px -24px rgba(0,0,0,0.5)",
              }}
            >
              {/* uploaded image layer */}
              {bgMode === "image" && bgImage && (
                <img
                  src={bgImage}
                  alt=""
                  crossOrigin="anonymous"
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ pointerEvents: "none" }}
                />
              )}

              {/* readability overlay for image mode + tier sheen otherwise */}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    bgMode === "image"
                      ? `linear-gradient(105deg, rgba(0,0,0,${Math.min(
                          overlay + 0.15,
                          0.92
                        )}) 0%, rgba(0,0,0,${overlay * 0.45}) 55%, rgba(0,0,0,${
                          overlay * 0.7
                        }) 100%)`
                      : cfg.sheen,
                  pointerEvents: "none",
                }}
              />

              {/* tier texture (e.g. Epic dotted grain) */}
              {bgMode !== "image" && cfg.pattern && (
                <div
                  className="absolute inset-0"
                  style={{ ...cfg.pattern, pointerEvents: "none" }}
                />
              )}

              {/* content */}
              <div className="relative h-full flex flex-col justify-between p-[6%]">
                {/* top row */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center" style={{ gap: "3.5%" }}>
                    <span
                      className="flex items-center justify-center"
                      style={{
                        width: "13%",
                        aspectRatio: "1 / 1",
                        borderRadius: "22%",
                        background: "rgba(0,0,0,0.22)",
                        border: "1px solid rgba(255,255,255,0.18)",
                      }}
                    >
                      <Icon
                        style={{ width: `${56 * cfg.iconScale}%`, height: `${56 * cfg.iconScale}%` }}
                        strokeWidth={2}
                        color="#fff"
                      />
                    </span>
                    <span
                      style={{
                        fontWeight: 800,
                        fontSize: "clamp(18px, 5.4vw, 34px)",
                        letterSpacing: "0.01em",
                        textShadow: "0 1px 8px rgba(0,0,0,0.25)",
                      }}
                    >
                      {cfg.label}
                    </span>
                  </div>
                  <SodexMark />
                </div>

                {/* middle: points */}
                <div className="flex-1 flex flex-col justify-center" style={{ marginTop: "2%" }}>
                  <span
                    style={{
                      fontSize: "clamp(10px, 2.6vw, 15px)",
                      letterSpacing: "0.14em",
                      fontWeight: 600,
                      color: "rgba(255,255,255,0.62)",
                      textTransform: "uppercase",
                    }}
                  >
                    {pointsLabel}
                  </span>
                  <div className="flex items-end gap-3" style={{ marginTop: "1.5%" }}>
                    <span
                      style={{
                        fontSize: "clamp(38px, 13vw, 84px)",
                        fontWeight: 800,
                        lineHeight: 0.92,
                        letterSpacing: "-0.03em",
                        textShadow: "0 2px 16px rgba(0,0,0,0.25)",
                      }}
                    >
                      {displayPoints}
                    </span>
                    <span
                      style={{
                        fontSize: "clamp(9px, 2.4vw, 15px)",
                        fontWeight: 700,
                        letterSpacing: "0.12em",
                        color: "rgba(255,255,255,0.5)",
                        paddingBottom: "1.5%",
                      }}
                    >
                      SOPOINTS
                    </span>
                  </div>
                  {percentile.trim() && (
                    <span
                      style={{
                        marginTop: "2.5%",
                        fontSize: "clamp(10px, 2.6vw, 15px)",
                        letterSpacing: "0.1em",
                        fontWeight: 600,
                        color: "rgba(255,255,255,0.6)",
                        textTransform: "uppercase",
                      }}
                    >
                      {percentile}
                    </span>
                  )}
                </div>

                {/* bottom row: url pill (anchored — never affected by the QR) */}
                <div
                  className="flex items-center"
                  style={{ minHeight: "13%", paddingRight: showQR && qrDataUrl ? "20%" : 0 }}
                >
                  {url.trim() && (
                    <span
                      className="flex items-center gap-2"
                      style={{
                        background: "rgba(0,0,0,0.30)",
                        border: "1px solid rgba(255,255,255,0.14)",
                        borderRadius: 999,
                        padding: "2.2% 4%",
                        backdropFilter: "blur(4px)",
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          background: "#34d399",
                          boxShadow: "0 0 8px #34d399",
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontSize: "clamp(10px, 2.7vw, 16px)",
                          fontWeight: 600,
                          color: "#fff",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {url}
                      </span>
                    </span>
                  )}
                </div>
              </div>

              {/* QR — absolutely placed in the bottom-right, centred against the
                  url pill row so it is balanced and clear of the bottom edge */}
              {showQR && qrDataUrl && (
                <span
                  className="absolute"
                  style={{
                    right: "6%",
                    bottom: "6.5%",
                    width: "15%",
                    aspectRatio: "1 / 1",
                    borderRadius: "16%",
                    background: "#fff",
                    padding: "1.6%",
                    boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrDataUrl}
                    alt="QR"
                    className="w-full h-full"
                    style={{ display: "block" }}
                  />
                </span>
              )}
            </div>

            {/* export button */}
            <button
              onClick={download}
              disabled={downloading}
              className="mt-3 sm:mt-4 w-full flex items-center justify-center gap-2 py-2.5 sm:py-3 font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ background: "var(--accent)", color: "var(--accent-fg)", borderRadius: 12 }}
            >
              <Download size={16} />
              {downloading ? "Rendering…" : "Download PNG"}
            </button>
          </div>

          {/* ════════ CONTROLS ════════ */}
          <div className="flex flex-col gap-3 sm:gap-5">
            {/* tier */}
            <Section icon={Sparkles} title="Tier">
              <div className="grid grid-cols-2 gap-2">
                {(Object.values(TIERS) as TierConfig[]).map((t) => {
                  const TIcon = t.icon;
                  const active = t.key === tier;
                  return (
                    <button
                      key={t.key}
                      onClick={() => setTier(t.key)}
                      className="flex items-center gap-2.5 px-3 py-2.5 transition-all"
                      style={{
                        borderRadius: 11,
                        border: `1px solid ${active ? "var(--text)" : "var(--border)"}`,
                        background: active ? "var(--bg-elevated)" : "var(--bg-surface)",
                      }}
                    >
                      <span
                        className="flex items-center justify-center shrink-0"
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 8,
                          background: t.swatch,
                          border: "1px solid rgba(128,128,128,0.35)",
                        }}
                      >
                        <TIcon size={14} color="#fff" strokeWidth={2.2} />
                      </span>
                      <span
                        className="text-[12.5px] font-semibold"
                        style={{ color: active ? "var(--text)" : "var(--text-muted)" }}
                      >
                        {t.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Section>

            {/* card type */}
            <Section icon={Sigma} title="Card type">
              <div className="flex gap-2">
                {(
                  [
                    { k: "total", label: "Total", sub: "MY SOPOINTS", icon: Sigma },
                    { k: "weekly", label: "Weekly", sub: "MY WEEK n", icon: CalendarDays },
                  ] as { k: CardType; label: string; sub: string; icon: React.ElementType }[]
                ).map(({ k, label, sub, icon: CIcon }) => {
                  const active = cardType === k;
                  return (
                    <button
                      key={k}
                      onClick={() => setCardType(k)}
                      className="flex-1 flex flex-col items-center gap-1 py-2.5 transition-all"
                      style={{
                        borderRadius: 11,
                        border: `1px solid ${active ? "var(--text)" : "var(--border)"}`,
                        background: active ? "var(--bg-elevated)" : "var(--bg-surface)",
                        color: active ? "var(--text)" : "var(--text-muted)",
                      }}
                    >
                      <CIcon size={16} />
                      <span className="text-[12.5px] font-semibold">{label}</span>
                      <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                        {sub}
                      </span>
                    </button>
                  );
                })}
              </div>
              {isWeekly && (
                <Field label="Week number">
                  <input
                    value={week}
                    onChange={(e) => setWeek(e.target.value.replace(/[^\d]/g, ""))}
                    inputMode="numeric"
                    className="ed-input"
                    placeholder="20"
                  />
                </Field>
              )}
            </Section>

            {/* text fields */}
            <Section icon={Type} title="Text">
              <Field label={isWeekly ? "SoPoints gained this week" : "SoPoints amount"}>
                <input
                  value={points}
                  onChange={(e) => setPoints(formatNumber(e.target.value))}
                  inputMode="numeric"
                  className="ed-input"
                  placeholder="15,301"
                />
              </Field>
              <Field label="Percentile / subtitle">
                <input
                  value={percentile}
                  onChange={(e) => setPercentile(e.target.value)}
                  className="ed-input"
                  placeholder="TOP 0.04% GLOBALLY"
                />
              </Field>
              <Field label="Join URL">
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="ed-input"
                  placeholder="sodex.com/join/trading"
                />
              </Field>
              <label className="flex items-center gap-2.5 mt-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showQR}
                  onChange={(e) => setShowQR(e.target.checked)}
                  style={{ accentColor: "var(--text)", width: 15, height: 15 }}
                />
                <span className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                  Show QR code (from URL)
                </span>
              </label>
            </Section>

            {/* background */}
            <Section icon={Palette} title="Background">
              <div className="flex gap-2 mb-1">
                {(
                  [
                    { k: "tier", label: "Tier", icon: Sparkles },
                    { k: "solid", label: "Colour", icon: Palette },
                    { k: "image", label: "Image", icon: ImageIcon },
                  ] as { k: BgMode; label: string; icon: React.ElementType }[]
                ).map(({ k, label, icon: BIcon }) => {
                  const active = bgMode === k;
                  return (
                    <button
                      key={k}
                      onClick={() => setBgMode(k)}
                      className="flex-1 flex flex-col items-center gap-1.5 py-2.5 transition-all"
                      style={{
                        borderRadius: 11,
                        border: `1px solid ${active ? "var(--text)" : "var(--border)"}`,
                        background: active ? "var(--bg-elevated)" : "var(--bg-surface)",
                        color: active ? "var(--text)" : "var(--text-muted)",
                      }}
                    >
                      <BIcon size={16} />
                      <span className="text-[11.5px] font-medium">{label}</span>
                    </button>
                  );
                })}
              </div>

              {bgMode === "solid" && (
                <Field label="Card colour">
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={solidColor}
                      onChange={(e) => setSolidColor(e.target.value)}
                      style={{
                        width: 44,
                        height: 36,
                        padding: 2,
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border)",
                        cursor: "pointer",
                      }}
                    />
                    <input
                      value={solidColor}
                      onChange={(e) => setSolidColor(e.target.value)}
                      className="ed-input flex-1 mono"
                    />
                  </div>
                </Field>
              )}

              {bgMode === "image" && (
                <div className="flex flex-col gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onUpload(e.target.files?.[0])}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 text-[12.5px] font-semibold"
                      style={{
                        borderRadius: 11,
                        border: "1px solid var(--border)",
                        background: "var(--bg-surface)",
                        color: "var(--text)",
                      }}
                    >
                      <Upload size={14} />
                      {bgImage ? "Replace image" : "Upload image"}
                    </button>
                    {bgImage && (
                      <button
                        onClick={() => {
                          setBgImage(null);
                          setBgMode("tier");
                        }}
                        className="flex items-center justify-center px-3"
                        style={{
                          borderRadius: 11,
                          border: "1px solid var(--border)",
                          background: "var(--bg-surface)",
                          color: "var(--red)",
                        }}
                        title="Remove image"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                  {bgImage && (
                    <Field label={`Darken overlay · ${Math.round(overlay * 100)}%`}>
                      <input
                        type="range"
                        min={0}
                        max={0.9}
                        step={0.05}
                        value={overlay}
                        onChange={(e) => setOverlay(Number(e.target.value))}
                        className="w-full"
                        style={{ accentColor: "var(--text)" }}
                      />
                    </Field>
                  )}
                  {!bgImage && (
                    <p className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>
                      Upload any image to use as the card background. A dark overlay keeps your
                      text readable.
                    </p>
                  )}
                </div>
              )}
            </Section>
          </div>
        </div>
      </div>

      <style jsx>{`
        .ed-input {
          width: 100%;
          padding: 7px 9px;
          font-size: 12px;
          color: var(--text);
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          outline: none;
          transition: border-color 0.15s;
        }
        @media (min-width: 640px) {
          .ed-input {
            padding: 9px 11px;
            font-size: 13px;
            border-radius: 11px;
          }
        }
        .ed-input:focus {
          border-color: var(--text-muted);
        }
        .ed-input::placeholder {
          color: var(--text-faint);
        }
      `}</style>
    </div>
  );
}

/* small layout helpers */
function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="p-3 sm:p-4"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14 }}
    >
      <div className="flex items-center gap-2 mb-2.5 sm:mb-3">
        <Icon size={14} style={{ color: "var(--text-muted)" }} />
        <span className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: "var(--text-faint)" }}>
          {title}
        </span>
      </div>
      <div className="flex flex-col gap-2.5 sm:gap-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 sm:gap-1.5">
      <span className="text-[10.5px] sm:text-[11.5px] font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}
