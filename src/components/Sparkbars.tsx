"use client";

/**
 * A compact row of vertical bars representing a series — always visible at the
 * foot of a stat card so the card reads as "alive" even before hover.
 */
export function Sparkbars({
  values,
  active = false,
  height = 22,
}: {
  values: number[];
  active?: boolean;
  height?: number;
}) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-[2px]" style={{ height }}>
      {values.map((v, i) => {
        const h = Math.max((v / max) * 100, 7);
        return (
          <div
            key={i}
            className={`spark-bar flex-1 rounded-[1px]${active ? " is-live" : ""}`}
            style={{
              height: `${h}%`,
              background: active ? "var(--accent)" : "var(--border)",
              opacity: active ? 0.4 + 0.6 * (h / 100) : 0.5 + 0.5 * (h / 100),
              // active: ripple the green wave; idle: stagger grow then soft wave
              animationDelay: active
                ? `${i * 90}ms`
                : `${i * 45}ms, ${500 + i * 160}ms`,
              transition: "background 0.3s ease, opacity 0.3s ease",
            }}
          />
        );
      })}
    </div>
  );
}
