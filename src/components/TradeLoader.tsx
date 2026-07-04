"use client";

interface TradeLoaderProps {
  label?: string;
  size?: number;
}

export function TradeLoader({ label = "LOADING PROFILE", size = 160 }: TradeLoaderProps) {
  const candles = [
    { x: 4, body: [28, 52], wick: [18, 62], bull: true },
    { x: 22, body: [22, 40], wick: [14, 48], bull: true },
    { x: 40, body: [34, 58], wick: [26, 66], bull: false },
    { x: 58, body: [20, 46], wick: [12, 54], bull: true },
    { x: 76, body: [30, 54], wick: [22, 62], bull: false },
    { x: 94, body: [16, 38], wick: [8, 46], bull: true },
    { x: 112, body: [26, 50], wick: [18, 58], bull: true },
    { x: 130, body: [22, 44], wick: [14, 52], bull: false },
  ];

  return (
    <div className="flex flex-col items-center gap-5">
      <div
        className="relative rounded-xl overflow-hidden"
        style={{
          width: size,
          height: size * 0.7,
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
        }}
      >
        {/* Grid lines */}
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 148 80"
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0 }}
        >
          {[16, 32, 48, 64].map((y) => (
            <line
              key={y}
              x1="0"
              y1={y}
              x2="148"
              y2={y}
              stroke="var(--border-subtle)"
              strokeWidth="0.3"
              strokeDasharray="2 3"
            />
          ))}
        </svg>

        {/* Animated candlesticks */}
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 148 80"
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0 }}
        >
          {candles.map((c, i) => {
            const color = c.bull ? "var(--green)" : "var(--red)";
            const delay = `${i * 0.12}s`;
            return (
              <g key={i}>
                {/* Wick */}
                <line
                  x1={c.x + 5}
                  y1={c.wick[0]}
                  x2={c.x + 5}
                  y2={c.wick[1]}
                  stroke={color}
                  strokeWidth="1"
                  opacity="0.5"
                  style={{
                    animation: `candleFade 1.6s ease-in-out ${delay} infinite`,
                  }}
                />
                {/* Body */}
                <rect
                  x={c.x}
                  y={c.body[0]}
                  width="10"
                  height={c.body[1] - c.body[0]}
                  rx="1.5"
                  fill={color}
                  style={{
                    animation: `candlePulse 1.6s ease-in-out ${delay} infinite`,
                    transformOrigin: `${c.x + 5}px ${(c.body[0] + c.body[1]) / 2}px`,
                  }}
                />
              </g>
            );
          })}
        </svg>

        {/* Scanning line */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "2px",
            height: "100%",
            background: "linear-gradient(180deg, transparent, var(--accent), transparent)",
            opacity: 0.6,
            animation: "scanLine 2s linear infinite",
          }}
        />

        {/* Corner accents */}
        {[
          { top: 0, left: 0, bt: "1px solid var(--accent)", br: "none", bb: "none", bl: "none" },
          { top: 0, right: 0, bt: "1px solid var(--accent)", bl: "none", bb: "none", br: "none" },
          { bottom: 0, left: 0, bb: "1px solid var(--accent)", br: "none", bt: "none", bl: "none" },
          { bottom: 0, right: 0, bb: "1px solid var(--accent)", bl: "none", bt: "none", br: "none" },
        ].map((c, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: 10,
              height: 10,
              ...c,
            }}
          />
        ))}
      </div>

      {/* Label with animated dots */}
      <div className="flex items-center gap-1.5">
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: "var(--green)", animation: "dotPulse 1.4s ease-in-out 0s infinite" }}
        />
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: "var(--accent)", animation: "dotPulse 1.4s ease-in-out 0.2s infinite" }}
        />
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: "var(--red)", animation: "dotPulse 1.4s ease-in-out 0.4s infinite" }}
        />
        <span className="mono text-xs font-bold tracking-widest ml-2" style={{ color: "var(--text-faint)" }}>
          {label}
        </span>
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes candlePulse {
          0%, 100% { opacity: 0.3; transform: scaleY(0.6); }
          50% { opacity: 1; transform: scaleY(1); }
        }
        @keyframes candleFade {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.6; }
        }
        @keyframes scanLine {
          0% { left: 0%; }
          100% { left: 100%; }
        }
        @keyframes dotPulse {
          0%, 100% { opacity: 0.2; transform: scale(0.7); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}
