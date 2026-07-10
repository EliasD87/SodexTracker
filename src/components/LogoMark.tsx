/**
 * Animated SoDEX Tracker candlestick mark.
 *
 * Loops a live-price-action motion — the body flickers green (up) then red
 * (down), the wicks stretch and recolour with it — then resolves into the
 * canonical white/ink logo and holds, before repeating. Pure SVG + CSS
 * (keyframes in globals.css: `sdx-candle-*`); respects prefers-reduced-motion,
 * where it renders as the static logo.
 */
export function LogoMark({ size = 22 }: { size?: number }) {
  const w = Math.round(size * (16 / 24));
  return (
    <svg
      width={w}
      height={size}
      viewBox="0 0 16 24"
      fill="none"
      role="img"
      aria-label="SoDEX Tracker"
      style={{ display: "block", overflow: "visible" }}
    >
      <line className="sdx-candle-wick sdx-wick-top" x1="8" y1="2" x2="8" y2="6.4" strokeWidth="2" strokeLinecap="round" stroke="var(--text)" />
      <rect className="sdx-candle-body" x="4.6" y="6" width="6.8" height="12" rx="2.7" fill="var(--text)" />
      <line className="sdx-candle-wick sdx-wick-bot" x1="8" y1="17.6" x2="8" y2="22" strokeWidth="2" strokeLinecap="round" stroke="var(--text)" />
    </svg>
  );
}
