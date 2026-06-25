"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { toPng } from "html-to-image";
import QRCode from "qrcode";
import { HexColorPicker } from "react-colorful";
import { parseGIF, decompressFrames } from "gifuct-js";
import { GIFEncoder, quantize, applyPalette } from "gifenc";
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
  /** optical size correction so every glyph reads at the same visual size */
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
    iconScale: 1.18,
    swatch: "#b27542",
  },
  silver: {
    key: "silver",
    label: "SILVER",
    gradient: "linear-gradient(150deg, #aab4c1 0%, #8089a0 55%, #69707f 100%)",
    sheen: "radial-gradient(120% 110% at 12% 0%, rgba(255,255,255,0.24), transparent 52%)",
    icon: Shield,
    iconScale: 1.0,
    swatch: "#8b95a6",
  },
  gold: {
    key: "gold",
    label: "GOLD",
    gradient: "linear-gradient(150deg, #f0c233 0%, #d6a31d 50%, #b5840f 100%)",
    sheen: "radial-gradient(120% 110% at 12% 0%, rgba(255,255,255,0.28), transparent 52%)",
    icon: Crown,
    iconScale: 1.85,
    swatch: "#dca81f",
  },
  diamond: {
    key: "diamond",
    label: "DIAMOND",
    gradient: "linear-gradient(150deg, #8482ee 0%, #6663d6 52%, #524ac2 100%)",
    sheen: "radial-gradient(120% 110% at 12% 0%, rgba(255,255,255,0.22), transparent 52%)",
    icon: Gem,
    iconScale: 1.12,
    swatch: "#6a67d8",
  },
  epic: {
    key: "epic",
    label: "EPIC",
    gradient: "radial-gradient(125% 145% at 50% -12%, #2b2b30 0%, #161618 40%, #0a0a0b 100%)",
    sheen: "radial-gradient(120% 110% at 12% 0%, rgba(255,255,255,0.05), transparent 50%)",
    icon: Crown,
    iconScale: 1.85,
    swatch: "#161618",
    pattern: {
      backgroundImage: "radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1.3px)",
      backgroundSize: "13px 13px",
    },
  },
};

type BgMode = "tier" | "solid" | "image";

/* CSS filter presets for uploaded image / GIF backgrounds. The same string is
   applied to the live <img> (so PNG export captures it) and to the canvas
   context during GIF export, so all three stay in sync. */
type EffectKey =
  | "none"
  | "mono"
  | "noir"
  | "sepia"
  | "vivid"
  | "warm"
  | "cool"
  | "fade"
  | "dramatic"
  | "blur";

const EFFECTS: { key: EffectKey; label: string; css: string }[] = [
  { key: "none", label: "Original", css: "none" },
  { key: "vivid", label: "Vivid", css: "saturate(1.55) contrast(1.08)" },
  { key: "dramatic", label: "Dramatic", css: "contrast(1.4) saturate(1.1) brightness(0.95)" },
  { key: "warm", label: "Warm", css: "sepia(0.28) saturate(1.35) hue-rotate(-12deg)" },
  { key: "cool", label: "Cool", css: "saturate(1.15) hue-rotate(15deg) brightness(1.03)" },
  { key: "fade", label: "Fade", css: "contrast(0.85) brightness(1.1) saturate(0.82)" },
  { key: "sepia", label: "Sepia", css: "sepia(0.65) contrast(1.05) saturate(1.1)" },
  { key: "mono", label: "B&W", css: "grayscale(1) contrast(1.06)" },
  { key: "noir", label: "Noir", css: "grayscale(1) contrast(1.42) brightness(0.94)" },
  { key: "blur", label: "Blur", css: "blur(3px) brightness(1.02)" },
];

const EFFECT_CSS: Record<EffectKey, string> = Object.fromEntries(
  EFFECTS.map((e) => [e.key, e.css])
) as Record<EffectKey, string>;

/* format an arbitrary string of digits with thousands separators */
function formatNumber(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("en-US");
}

/* ──────────────────────────────────────────────────────────────
   TierIcon — every lucide glyph fills a different portion of its
   24×24 viewBox (Crown is wide & flat, Medal is tall & narrow…), so
   a fixed render size makes them look unequal. Each tier carries an
   explicit `scale` optical-correction factor so they all read at the
   same visual size.
   ────────────────────────────────────────────────────────────── */
function TierIcon({
  icon: Icon,
  scale = 1,
  strokeWidth = 2,
}: {
  icon: React.ElementType;
  scale?: number;
  strokeWidth?: number;
}) {
  const Cmp = Icon as React.ForwardRefExoticComponent<
    React.SVGProps<SVGSVGElement> & React.RefAttributes<SVGSVGElement>
  >;

  return (
    <Cmp
      strokeWidth={strokeWidth}
      color="#fff"
      style={{
        width: "62%",
        height: "62%",
        transform: `scale(${scale})`,
        transformOrigin: "center",
        transition: "transform 0.12s",
      }}
    />
  );
}

/* ──────────────────────────────────────────────────────────────
   SoDEX wordmark — official logo (orange cube + white wordmark)
   ────────────────────────────────────────────────────────────── */
function SodexMark({ dark = false }: { dark?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={dark ? "/sodex-logo-dark.svg" : "/sodex-logo.svg"}
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
  // SoDEX logo colour — white reads on dark backgrounds, dark on light ones
  const [logoDark, setLogoDark] = useState(false);

  // weekly cards show a "MY WEEK n SOPOINTS" label and a "+" gain prefix;
  // total cards show "MY SOPOINTS" with the raw amount.
  const isWeekly = cardType === "weekly";
  const pointsLabel = isWeekly ? `MY WEEK ${week || "1"} SOPOINTS` : "MY SOPOINTS";
  const showPlus = isWeekly;

  // ── background ──
  const [bgMode, setBgMode] = useState<BgMode>("tier");
  const [solidColor, setSolidColor] = useState("#5b21b6");
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [bgIsGif, setBgIsGif] = useState(false);
  const [imgEffect, setImgEffect] = useState<EffectKey>("none");
  const [overlay, setOverlay] = useState(0.55);
  // CSS filter for the uploaded image/GIF background (preview + both exports)
  const imgFilter = EFFECT_CSS[imgEffect];
  // when true the card renders without its background image / base so we can
  // snapshot just the text+QR overlay (transparent) for per-frame GIF compositing
  const [captureOverlay, setCaptureOverlay] = useState(false);

  // ── derived ──
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const cfg = TIERS[tier];
  const Icon = cfg.icon;

  /* Generate a QR code from the typed URL, locally (as a data URL so export
     never taints the canvas and the code always matches the join link). */
  useEffect(() => {
    const clean = url.trim();
    if (!clean) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    const target = clean.startsWith("http") ? clean : `https://${clean}`;
    QRCode.toDataURL(target, {
      width: 440,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const onUpload = (file?: File | null) => {
    if (!file) return;
    setBgIsGif(file.type === "image/gif");
    const reader = new FileReader();
    reader.onload = () => {
      setBgImage(reader.result as string);
      setBgMode("image");
    };
    reader.readAsDataURL(file);
  };

  /* snapshot the card to a PNG data URL, with a font-embed fallback */
  const snapshotCard = useCallback(async (node: HTMLElement, ratio: number) => {
    const withTimeout = <T,>(p: Promise<T>, ms: number) =>
      Promise.race([
        p,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error("render-timeout")), ms)
        ),
      ]);
    try {
      return await withTimeout(toPng(node, { pixelRatio: ratio, cacheBust: true }), 9000);
    } catch {
      return await withTimeout(
        toPng(node, { pixelRatio: ratio, cacheBust: true, skipFonts: true }),
        9000
      );
    }
  }, []);

  /* GIF export — composite the static card overlay onto every frame of the
     uploaded GIF and re-encode an animated GIF. */
  const exportGif = useCallback(async () => {
    const node = cardRef.current;
    if (!node || !bgImage) return;

    // cap the output width — GIF size grows with the pixel count (quadratically
    // with dimensions), so 540px keeps the file shareable.
    const rect = node.getBoundingClientRect();
    const scale = 540 / rect.width;
    const W = Math.round(rect.width * scale);
    const H = Math.round(rect.height * scale);

    // 1) capture the overlay (text/QR/logo) on a transparent card
    setCaptureOverlay(true);
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r(null)))
    );
    let overlayUrl: string;
    try {
      overlayUrl = await snapshotCard(node, scale);
    } finally {
      setCaptureOverlay(false);
    }
    const overlayImg = await new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = overlayUrl;
    });

    // 2) decode the GIF frames
    const buff = await (await fetch(bgImage)).arrayBuffer();
    const gif = parseGIF(buff);
    const frames = decompressFrames(gif, true);
    if (!frames.length) throw new Error("no-frames");
    const gw = gif.lsd.width;
    const gh = gif.lsd.height;

    // accumulation canvas at the GIF's logical size (handles frame disposal)
    const acc = document.createElement("canvas");
    acc.width = gw;
    acc.height = gh;
    const actx = acc.getContext("2d")!;
    const patch = document.createElement("canvas");
    const ptctx = patch.getContext("2d")!;

    // output canvas (card size) + cover-fit transform for the background
    const out = document.createElement("canvas");
    out.width = W;
    out.height = H;
    const octx = out.getContext("2d")!;
    const cover = Math.max(W / gw, H / gh);
    const dw = gw * cover;
    const dh = gh * cover;
    const dx = (W - dw) / 2;
    const dy = (H - dh) / 2;

    // keep at most ~MAX_FRAMES frames; every frame is still processed so the
    // disposal/accumulation stays correct, but only kept frames are encoded and
    // the dropped frames' duration is folded into the next kept one.
    const MAX_FRAMES = 24;
    const stride = Math.max(1, Math.ceil(frames.length / MAX_FRAMES));

    const enc = GIFEncoder();
    let prevDisposal = 0;
    let prev = { x: 0, y: 0, w: 0, h: 0 };
    let pendingDelay = 0;

    frames.forEach((f, i) => {
      if (prevDisposal === 2) actx.clearRect(prev.x, prev.y, prev.w, prev.h);
      const { width: fw, height: fh, top, left } = f.dims;
      patch.width = fw;
      patch.height = fh;
      ptctx.putImageData(new ImageData(new Uint8ClampedArray(f.patch), fw, fh), 0, 0);
      actx.drawImage(patch, left, top);
      prevDisposal = f.disposalType;
      prev = { x: left, y: top, w: fw, h: fh };
      pendingDelay += f.delay || 100;

      const kept = i % stride === 0 || i === frames.length - 1;
      if (!kept) return;

      // background frame (cover, with the chosen effect) + the static overlay
      octx.clearRect(0, 0, W, H);
      octx.filter = imgFilter === "none" ? "none" : imgFilter;
      octx.drawImage(acc, dx, dy, dw, dh);
      octx.filter = "none";
      octx.drawImage(overlayImg, 0, 0, W, H);

      const { data } = octx.getImageData(0, 0, W, H);
      const palette = quantize(data, 256);
      const index = applyPalette(data, palette);
      enc.writeFrame(index, W, H, { palette, delay: pendingDelay });
      pendingDelay = 0;
    });
    enc.finish();

    const blob = new Blob([new Uint8Array(enc.bytes())], { type: "image/gif" });
    const aurl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.download = `sopoints-${tier}-${cardType}.gif`;
    a.href = aurl;
    a.click();
    URL.revokeObjectURL(aurl);
  }, [bgImage, tier, cardType, snapshotCard, imgFilter]);

  const download = useCallback(async () => {
    const node = cardRef.current;
    if (!node || downloading) return;
    setDownloading(true);
    try {
      // make sure the web fonts have finished loading before we snapshot
      try {
        await document.fonts?.ready;
      } catch {
        /* ignore */
      }

      if (bgMode === "image" && bgIsGif && bgImage) {
        await exportGif();
        return;
      }

      // render at ~1080px wide regardless of preview size, capped so phones
      // don't choke on a huge canvas
      const ratio = Math.min(Math.max(1080 / node.offsetWidth, 1), 2.5);
      const dataUrl = await snapshotCard(node, ratio);

      const a = document.createElement("a");
      a.download = `sopoints-${tier}-${cardType}.png`;
      a.href = dataUrl;
      a.click();
    } catch (err) {
      console.error("SoPoints export failed:", err);
      alert("Sorry — the card couldn't be exported. Please try again.");
    } finally {
      setDownloading(false);
    }
  }, [tier, cardType, downloading, bgMode, bgIsGif, bgImage, exportGif, snapshotCard]);

  /* the card background, depending on the chosen mode. During overlay capture
     (GIF export) the image base goes transparent so only the overlay is drawn. */
  const cardBackground =
    captureOverlay && bgMode === "image"
      ? "transparent"
      : bgMode === "solid"
      ? solidColor
      : bgMode === "image"
      ? "#0b0b0b"
      : cfg.gradient;

  const displayPoints = `${showPlus ? "+" : ""}${points || "0"}`;

  // colour for the on-screen-only glow behind the card (never in the export)
  const glowColor =
    bgMode === "solid" ? solidColor : bgMode === "image" ? "#555555" : cfg.swatch;

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
            {/* glow wrapper — a subtle colour glow shown on the website only;
                it is on this wrapper, not the card, so the exported PNG
                (html-to-image captures the inner card ref) never includes it */}
            <div
              className="relative"
              style={{
                borderRadius: 22,
                boxShadow: `0 8px 40px -10px ${glowColor}b3, 0 0 16px -2px ${glowColor}66`,
                transition: "box-shadow 0.3s ease",
              }}
            >
            <div
              ref={cardRef}
              className="relative w-full overflow-hidden select-none"
              style={{
                aspectRatio: "1.9 / 1",
                borderRadius: 22,
                background: cardBackground,
                color: "#fff",
                boxShadow: "0 24px 60px -24px rgba(0,0,0,0.5)",
                // size all text relative to the card width (not the viewport) so the
                // layout is identical on phone, desktop, and in the exported PNG
                containerType: "inline-size",
              }}
            >
              {/* uploaded image layer (hidden during GIF overlay capture) */}
              {bgMode === "image" && bgImage && !captureOverlay && (
                <img
                  src={bgImage}
                  alt=""
                  crossOrigin="anonymous"
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ pointerEvents: "none", filter: imgFilter }}
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
                      <TierIcon icon={Icon} scale={cfg.iconScale} />
                    </span>
                    <span
                      style={{
                        fontWeight: 800,
                        fontSize: "clamp(15px, 5.2cqi, 34px)",
                        letterSpacing: "0.01em",
                        textShadow: "0 1px 8px rgba(0,0,0,0.25)",
                      }}
                    >
                      {cfg.label}
                    </span>
                  </div>
                  <SodexMark dark={logoDark} />
                </div>

                {/* middle: points */}
                <div className="flex-1 flex flex-col justify-center" style={{ marginTop: "2%" }}>
                  <span
                    style={{
                      fontSize: "clamp(8px, 2.4cqi, 15px)",
                      letterSpacing: "0.14em",
                      fontWeight: 600,
                      color: "rgba(255,255,255,0.62)",
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {pointsLabel}
                  </span>
                  <div className="flex items-end gap-3" style={{ marginTop: "1.5%" }}>
                    <span
                      style={{
                        fontSize: "clamp(30px, 12.4cqi, 82px)",
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
                        fontSize: "clamp(8px, 2.2cqi, 15px)",
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
                        fontSize: "clamp(8px, 2.4cqi, 15px)",
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
                        background: "rgba(0,0,0,0.38)",
                        border: "1px solid rgba(255,255,255,0.14)",
                        borderRadius: 999,
                        padding: "2.2% 4%",
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
                          fontSize: "clamp(9px, 2.5cqi, 16px)",
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
            </div>

            {/* export button */}
            <button
              onClick={download}
              disabled={downloading}
              className="mt-3 sm:mt-4 w-full flex items-center justify-center gap-2 py-2.5 sm:py-3 text-[13px] sm:text-[15px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ background: "var(--accent)", color: "var(--accent-fg)", borderRadius: 12 }}
            >
              <Download size={15} />
              {downloading
                ? "Rendering…"
                : bgMode === "image" && bgIsGif
                ? "Download GIF"
                : "Download PNG"}
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
                      className="flex items-center gap-2 sm:gap-2.5 px-2.5 sm:px-3 py-2 sm:py-2.5 transition-all"
                      style={{
                        borderRadius: 11,
                        border: `1px solid ${active ? "var(--text)" : "var(--border)"}`,
                        background: active ? "var(--bg-elevated)" : "var(--bg-surface)",
                      }}
                    >
                      <span
                        className="flex items-center justify-center shrink-0 w-[22px] h-[22px] sm:w-[26px] sm:h-[26px]"
                        style={{
                          borderRadius: 7,
                          background: t.swatch,
                          border: "1px solid rgba(128,128,128,0.35)",
                        }}
                      >
                        <TIcon size={13} color="#fff" strokeWidth={2.2} />
                      </span>
                      <span
                        className="text-[11.5px] sm:text-[12.5px] font-semibold"
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
                      className="flex-1 flex flex-col items-center gap-0.5 sm:gap-1 py-2 sm:py-2.5 transition-all"
                      style={{
                        borderRadius: 11,
                        border: `1px solid ${active ? "var(--text)" : "var(--border)"}`,
                        background: active ? "var(--bg-elevated)" : "var(--bg-surface)",
                        color: active ? "var(--text)" : "var(--text-muted)",
                      }}
                    >
                      <CIcon size={15} />
                      <span className="text-[11.5px] sm:text-[12.5px] font-semibold">{label}</span>
                      <span className="text-[9.5px] sm:text-[10px]" style={{ color: "var(--text-faint)" }}>
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
              <Toggle checked={showQR} onChange={setShowQR} label="Show QR code (from URL)" />
              <Toggle
                checked={logoDark}
                onChange={setLogoDark}
                label="Dark SoDEX logo (for light backgrounds)"
              />
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
                      className="flex-1 flex flex-col items-center gap-1 sm:gap-1.5 py-2 sm:py-2.5 transition-all"
                      style={{
                        borderRadius: 11,
                        border: `1px solid ${active ? "var(--text)" : "var(--border)"}`,
                        background: active ? "var(--bg-elevated)" : "var(--bg-surface)",
                        color: active ? "var(--text)" : "var(--text-muted)",
                      }}
                    >
                      <BIcon size={15} />
                      <span className="text-[10.5px] sm:text-[11.5px] font-medium">{label}</span>
                    </button>
                  );
                })}
              </div>

              {bgMode === "solid" && (
                <Field label="Card colour">
                  <ColorField value={solidColor} onChange={setSolidColor} />
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
                      className="flex-1 flex items-center justify-center gap-2 py-2 sm:py-2.5 text-[11.5px] sm:text-[12.5px] font-semibold"
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
                          setBgIsGif(false);
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
                    <Field label="Effect">
                      <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                        {EFFECTS.map((e) => {
                          const active = imgEffect === e.key;
                          return (
                            <button
                              key={e.key}
                              type="button"
                              onClick={() => setImgEffect(e.key)}
                              className="py-1.5 sm:py-2 text-[11px] sm:text-[12px] font-medium transition-all"
                              style={{
                                borderRadius: 9,
                                border: `1px solid ${active ? "var(--text)" : "var(--border)"}`,
                                background: active ? "var(--bg-elevated)" : "var(--bg-surface)",
                                color: active ? "var(--text)" : "var(--text-muted)",
                              }}
                            >
                              {e.label}
                            </button>
                          );
                        })}
                      </div>
                    </Field>
                  )}
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
                  {bgImage && bgIsGif && (
                    <p className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                      Animated GIF detected — the card will export as an animated GIF.
                    </p>
                  )}
                  {!bgImage && (
                    <p className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>
                      Upload any image (incl. animated GIFs) to use as the card background. A dark
                      overlay keeps your text readable.
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

/* Modern colour picker — swatch opens a react-colorful popover */
const SWATCHES = ["#5b21b6", "#0f172a", "#dc2626", "#0891b2", "#16a34a", "#ea580c", "#db2777"];

function ColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Pick colour"
          style={{
            width: 38,
            height: 38,
            borderRadius: 999,
            background: value,
            border: "2px solid var(--border)",
            boxShadow: "inset 0 1px 3px rgba(0,0,0,0.25)",
            cursor: "pointer",
            flexShrink: 0,
          }}
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="ed-input flex-1 mono"
        />
      </div>

      <div className="flex gap-1.5 mt-2.5">
        {SWATCHES.map((c) => {
          const active = value.toLowerCase() === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              aria-label={c}
              style={{
                width: 24,
                height: 24,
                borderRadius: 999,
                background: c,
                cursor: "pointer",
                border: `2px solid ${active ? "var(--text)" : "transparent"}`,
                boxShadow: active ? "0 0 0 1px var(--text)" : "inset 0 1px 2px rgba(0,0,0,0.25)",
                transition: "border-color 0.15s, box-shadow 0.15s",
              }}
            />
          );
        })}
      </div>

      {open && (
        <div
          className="sopoints-picker mt-3"
          style={{
            padding: 12,
            borderRadius: 14,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            boxShadow: "0 12px 34px rgba(0,0,0,0.4)",
          }}
        >
          <HexColorPicker color={value} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

/* Modern sliding toggle switch */
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center justify-between gap-3 mt-1 cursor-pointer select-none">
      <span className="text-[11.5px] sm:text-[12.5px]" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          position: "relative",
          flexShrink: 0,
          width: 38,
          height: 22,
          borderRadius: 999,
          border: "1px solid var(--border)",
          background: checked ? "var(--text)" : "var(--bg-surface)",
          transition: "background 0.18s ease",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: checked ? 18 : 2,
            width: 16,
            height: 16,
            borderRadius: 999,
            background: checked ? "var(--bg-surface)" : "var(--text-muted)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
            transition: "left 0.18s ease, background 0.18s ease",
          }}
        />
      </button>
    </label>
  );
}
