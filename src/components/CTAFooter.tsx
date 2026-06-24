"use client";

export function CTAFooter() {
  return (
    <footer>
      {/* CTA band */}
      <div
        className="py-20 border-y"
        style={{ borderColor: "var(--border)", background: "var(--bg)" }}
      >
        <div className="max-w-[1200px] mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-5">
            <div
              className="w-12 h-12 flex items-center justify-center rounded-sm font-bold mono text-lg shrink-0"
              style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
            >
              SD
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
                Stay ahead of the markets.
              </p>
              <p className="text-base font-bold tracking-tight" style={{ color: "var(--text-muted)" }}>
                Open the tracker today.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:items-end gap-3">
            <p className="text-sm text-center sm:text-right" style={{ color: "var(--text-muted)" }}>
              Real-time data. Transparent analytics.
              <br />
              Built for the SoDEX community.
            </p>
            <button
              className="flex items-center gap-2 px-5 py-3 font-semibold rounded-sm transition-opacity hover:opacity-80"
              style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
            >
              Open Tracker <span>→</span>
            </button>
          </div>
        </div>
      </div>

      {/* Footer links */}
      <div
        className="py-8"
        style={{ background: "var(--bg-surface)" }}
      >
        <div className="max-w-[1200px] mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-5 flex items-center justify-center rounded-sm font-bold text-[10px] mono"
              style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
            >
              SD
            </div>
            <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
              SoDEX<span style={{ color: "var(--accent)" }}>.</span>tracker
            </span>
          </div>

          <div className="flex items-center gap-6">
            {["Markets", "Leaderboard", "Pairs", "Dashboard", "About"].map((link) => (
              <a
                key={link}
                href={`#${link.toLowerCase()}`}
                className="text-xs transition-colors"
                style={{ color: "var(--text-faint)" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-faint)")}
              >
                {link}
              </a>
            ))}
          </div>

          <p className="text-xs mono" style={{ color: "var(--text-faint)" }}>
            © 2025 SoDEX Tracker
          </p>
        </div>
      </div>
    </footer>
  );
}
