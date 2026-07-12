"use client";

const STATS = [
  {
    label: "24H VOLUME",
    value: "$12.64M",
    delta: "+18.27%",
    up: true,
    sub: "vs yesterday",
  },
  {
    label: "OPEN INTEREST",
    value: "$8.32M",
    delta: "+6.41%",
    up: true,
    sub: "across all pairs",
  },
  {
    label: "TOTAL USERS",
    value: "6,521",
    delta: "+12.68%",
    up: true,
    sub: "active in 24H",
  },
  {
    label: "TVL",
    value: "$24.80M",
    delta: "-2.14%",
    up: false,
    sub: "total value locked",
  },
];

export function LiveStats() {
  return (
    <section className="border-b" style={{ borderColor: "var(--border-subtle)" }}>
      <div className="max-w-[1200px] mx-auto">
        <div
          className="grid grid-cols-2 lg:grid-cols-4"
          style={{ borderLeft: "1px solid var(--border-subtle)" }}
        >
          {STATS.map((s, i) => (
            <div
              key={s.label}
              className="px-7 py-6 flex flex-col gap-1"
              style={{
                borderRight: "1px solid var(--border-subtle)",
                borderBottom: i < 2 ? "1px solid var(--border-subtle)" : undefined,
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-[10px] mono tracking-widest"
                  style={{ color: "var(--text-faint)" }}
                >
                  {s.label}
                </span>
                <span
                  className="live-dot w-1 h-1 rounded-full"
                  style={{ background: "var(--accent)" }}
                />
              </div>
              <div
                className="text-3xl font-bold mono tracking-tight"
                style={{ color: "var(--text)" }}
              >
                {s.value}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="text-xs mono font-medium"
                  style={{
                    color: s.up ? "var(--color-up)" : "var(--color-down)",
                  }}
                >
                  {s.delta}
                </span>
                <span className="text-xs" style={{ color: "var(--text-faint)" }}>
                  {s.sub}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
