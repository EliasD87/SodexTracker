"use client";

import { useId, type CSSProperties, type ReactNode } from "react";

/**
 * Sodextra's bot characters, ported from sodextra.xyz (apps/web bot-avatar.tsx) so they
 * look and move the same here: each one hops, sways or bobs, looks around, blinks and
 * plays with its prop, a glint sweeps its tile, and hovering makes it jump. Classes are
 * prefixed sxb- so they can't meet this site's own.
 */

export type SodextraBotKind = "maker" | "taker" | "grid" | "maker-position" | "dca";

type Motion = "hop" | "sway" | "bob";

const BOTS: Record<
  SodextraBotKind,
  { name: string; tile: [string, string]; body: ReactNode; eyes: [number, number, number]; spark: [number, number]; motion: Motion }
> = {
  // A wave-crested blob: flow, volume. It rides a wave.
  maker: {
    name: "Maker Volume",
    tile: ["#3cb8ff", "#1767ff"],
    body: <path d="M11.5 31.5c0-7.3 5.6-13.3 12.5-13.3 2.9 0 5-2.5 6.6-5.2.9 2.6.6 5.4-.8 7.6 4.2 2.2 6.7 6.2 6.7 10.9 0 5.7-5.6 7.5-12.5 7.5s-12.5-1.8-12.5-7.5z" />,
    eyes: [20.2, 27.8, 29.5],
    spark: [12.5, 11.5],
    motion: "sway",
  },
  // A round body under a lightning bolt: quick trades at market. The bolt flashes.
  taker: {
    name: "Taker Volume",
    tile: ["#b8f53d", "#4fa30a"],
    body: (
      <>
        <ellipse cx="23" cy="30" rx="12" ry="10" />
        <path className="sxb-bolt" style={{ transformOrigin: "31px 13px" }} d="M33.6 4.8 26.4 14.6h4.6l-2.4 7.6 8.2-10.8h-4.6l2.6-6.6z" fill="#ffe14d" />
      </>
    ),
    eyes: [19, 27, 30],
    spark: [11.5, 13],
    motion: "sway",
  },
  // A block with two notches: steps, a grid. Its ears wiggle.
  grid: {
    name: "Grid",
    tile: ["#ff5fa2", "#ff2d6a"],
    body: (
      <>
        <rect x="12" y="17.5" width="24" height="21" rx="8" />
        <rect className="sxb-ear-l" style={{ transformOrigin: "17.75px 19.5px" }} x="14.5" y="12.5" width="6.5" height="7" rx="2.4" />
        <rect className="sxb-ear-r" style={{ transformOrigin: "30.25px 19.5px" }} x="27" y="12.5" width="6.5" height="7" rx="2.4" />
      </>
    ),
    eyes: [20, 28, 28.5],
    spark: [39, 12],
    motion: "hop",
  },
  // A sturdy block with a weight on top: it holds a position and sits on it.
  "maker-position": {
    name: "Maker Position",
    tile: ["#7c8cff", "#4a3cff"],
    body: (
      <>
        <rect x="12" y="20" width="24" height="19" rx="7" />
        <rect x="19" y="12.5" width="10" height="5.5" rx="2" />
      </>
    ),
    eyes: [19.8, 28.2, 29],
    spark: [12, 12.5],
    motion: "bob",
  },
  // A round body with three steps beside it: it buys in steps.
  dca: {
    name: "DCA",
    tile: ["#ff8a5c", "#e8452c"],
    body: (
      <>
        <ellipse cx="22" cy="29.5" rx="11" ry="10" />
        <rect x="31" y="27" width="5" height="4" rx="1" />
        <rect x="33" y="21" width="5" height="4" rx="1" />
        <rect x="35" y="15" width="5" height="4" rx="1" />
      </>
    ),
    eyes: [18, 26, 29],
    spark: [11, 13],
    motion: "sway",
  },
};

export const SODEXTRA_BOTS: SodextraBotKind[] = ["maker", "taker", "grid", "maker-position", "dca"];

function Sparkle({ x, y }: { x: number; y: number }) {
  return (
    <path
      className="sxb-twinkle"
      style={{ transformOrigin: `${x}px ${y}px` }}
      d={`M${x} ${y - 4.2}c.4 2.6 1.6 3.8 4.2 4.2-2.6.4-3.8 1.6-4.2 4.2-.4-2.6-1.6-3.8-4.2-4.2 2.6-.4 3.8-1.6 4.2-4.2z`}
      fill="#fff"
    />
  );
}

/** One bot on its tile. `delay` sets where its loops start, so a row doesn't move in step. */
export function SodextraBot({ kind, size = 28, delay = 0, jumpDelay = 0 }: { kind: SodextraBotKind; size?: number; delay?: number; jumpDelay?: number }) {
  const art = BOTS[kind];
  const gid = `sxb-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  const [lx, rx, ey] = art.eyes;
  const [sx, sy] = art.spark;
  return (
    <span className="sxb relative inline-flex shrink-0" style={{ width: size, height: size }} title={art.name}>
      <svg
        viewBox="0 0 48 48"
        width={size}
        height={size}
        className="sxb-awake"
        style={{ filter: `drop-shadow(0 3px 6px ${art.tile[1]}55)`, "--sxb-delay": `-${delay.toFixed(2)}s` } as CSSProperties}
        aria-hidden
      >
        <defs>
          <linearGradient id={`${gid}-tile`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={art.tile[0]} />
            <stop offset="1" stopColor={art.tile[1]} />
          </linearGradient>
          <linearGradient id={`${gid}-shine`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
            <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <clipPath id={`${gid}-clip`}>
            <rect width="48" height="48" rx="13" />
          </clipPath>
        </defs>
        <rect width="48" height="48" rx="13" fill={`url(#${gid}-tile)`} />
        <rect width="48" height="48" rx="13" fill={`url(#${gid}-shine)`} />
        <g clipPath={`url(#${gid}-clip)`}>
          <g transform="rotate(24 24 24)">
            <rect className="sxb-glint" x="-14" y="-12" width="7" height="72" fill="#fff" />
          </g>
        </g>
        <g className="sxb-react" style={{ transformOrigin: "24px 40px", animationDelay: `${jumpDelay}ms` }}>
          <ellipse
            className={art.motion === "hop" ? "sxb-hop-shadow" : undefined}
            style={{ transformOrigin: "24px 41px" }}
            cx="24"
            cy="41"
            rx="10"
            ry="1.8"
            fill="#000"
            opacity="0.12"
          />
          <g className={`sxb-${art.motion}`} style={{ transformOrigin: "24px 40px" }}>
            <g fill="#fff">{art.body}</g>
            <g className="sxb-look">
              <g className="sxb-eyes" style={{ transformOrigin: `24px ${ey}px` }} fill="#14161b">
                <ellipse cx={lx} cy={ey} rx="1.9" ry="2.7" />
                <ellipse cx={rx} cy={ey} rx="1.9" ry="2.7" />
              </g>
            </g>
          </g>
        </g>
        <Sparkle x={sx} y={sy} />
      </svg>
    </span>
  );
}

/** The bots' motion, from sodextra.xyz's stylesheet. Rendered once by whoever shows bots. */
export const SODEXTRA_BOT_CSS = `
.sxb-awake :is(.sxb-hop,.sxb-hop-shadow,.sxb-sway,.sxb-bob,.sxb-look,.sxb-eyes,.sxb-bolt,.sxb-ear-l,.sxb-ear-r,.sxb-twinkle,.sxb-glint){animation-delay:var(--sxb-delay,0s);animation-iteration-count:infinite}
.sxb-awake .sxb-hop{animation-name:sxb-hop;animation-duration:3.6s;animation-timing-function:cubic-bezier(.3,.7,.4,1)}
@keyframes sxb-hop{0%,60%,100%{transform:translateY(0) scale(1,1)}65%{transform:translateY(.6px) scale(1.08,.9)}74%{transform:translateY(-4.5px) scale(.95,1.07)}82%{transform:translateY(0) scale(1.07,.92)}88%{transform:translateY(-.6px) scale(.98,1.02)}93%{transform:translateY(0) scale(1,1)}}
.sxb-awake .sxb-hop-shadow{animation-name:sxb-hop-shadow;animation-duration:3.6s}
@keyframes sxb-hop-shadow{0%,60%,93%,100%{transform:scale(1)}74%{transform:scale(.65)}82%{transform:scale(1.12)}}
.sxb-awake .sxb-sway{animation-name:sxb-sway;animation-duration:3s;animation-timing-function:ease-in-out}
@keyframes sxb-sway{0%,100%{transform:rotate(-5deg) translateY(0)}50%{transform:rotate(5deg) translateY(-1.8px)}}
.sxb-awake .sxb-bob{animation-name:sxb-bob;animation-duration:3.2s;animation-timing-function:ease-in-out}
@keyframes sxb-bob{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-1.8px) rotate(-2deg)}}
.sxb-awake .sxb-look{animation-name:sxb-look;animation-duration:7s;animation-timing-function:ease-in-out}
@keyframes sxb-look{0%,28%,100%{transform:translateX(0)}34%,46%{transform:translateX(-1.3px)}54%,66%{transform:translateX(1.3px)}72%{transform:translateX(0)}}
.sxb-awake .sxb-eyes{animation-name:sxb-blink;animation-duration:5s}
@keyframes sxb-blink{0%,86%,91%,100%{transform:scaleY(1)}88%,93%{transform:scaleY(.12)}95%{transform:scaleY(1)}}
.sxb-awake .sxb-bolt{animation-name:sxb-bolt;animation-duration:2.4s;animation-timing-function:ease-out}
@keyframes sxb-bolt{0%,68%,100%{transform:scale(1) rotate(0);opacity:1}74%{transform:scale(1.2) rotate(-8deg)}80%{transform:scale(1) rotate(0);opacity:.5}86%{opacity:1}}
.sxb-awake .sxb-ear-l,.sxb-awake .sxb-ear-r{animation-name:sxb-ear;animation-duration:3s;animation-timing-function:ease-in-out}
.sxb-awake .sxb-ear-r{animation-name:sxb-ear-r}
@keyframes sxb-ear{0%,60%,100%{transform:rotate(0)}68%{transform:rotate(-16deg)}78%{transform:rotate(8deg)}86%{transform:rotate(0)}}
@keyframes sxb-ear-r{0%,64%,100%{transform:rotate(0)}72%{transform:rotate(16deg)}82%{transform:rotate(-8deg)}90%{transform:rotate(0)}}
.sxb-awake .sxb-twinkle{animation-name:sxb-twinkle;animation-duration:2.6s;animation-timing-function:ease-in-out}
@keyframes sxb-twinkle{0%,100%{opacity:1;transform:scale(1) rotate(0)}50%{opacity:.4;transform:scale(.6) rotate(45deg)}}
.sxb-glint{opacity:0}
.sxb-awake .sxb-glint{animation-name:sxb-glint;animation-duration:6s;animation-timing-function:ease-in-out}
@keyframes sxb-glint{0%,72%{opacity:0;transform:translateX(0)}76%{opacity:.22}90%{opacity:.22;transform:translateX(62px)}92%,100%{opacity:0;transform:translateX(62px)}}
.sxb:hover .sxb-react,.sxb-wave:hover .sxb-react{animation:sxb-jump .7s cubic-bezier(.3,.7,.4,1)}
@keyframes sxb-jump{0%,100%{transform:translateY(0) scale(1,1)}15%{transform:translateY(.8px) scale(1.1,.88)}45%{transform:translateY(-6px) scale(.94,1.08) rotate(-6deg)}70%{transform:translateY(0) scale(1.08,.92)}85%{transform:translateY(-1px) scale(.98,1.02)}}
@media (prefers-reduced-motion:reduce){.sxb-awake *,.sxb-react{animation:none!important}}
`;
