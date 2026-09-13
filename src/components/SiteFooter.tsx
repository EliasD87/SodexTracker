/**
 * The quiet end of the page — a single X link, nothing else.
 *
 * Deliberately not the old CTAFooter, which is unused and still carries dead
 * "#markets" anchors and a button that goes nowhere.
 */

const X_URL = "https://x.com/eliasing__";

export function SiteFooter() {
  return (
    <footer
      className="py-10 border-t"
      style={{ borderColor: "var(--border-subtle)" }}
    >
      <div className="max-w-[1200px] mx-auto px-5 flex justify-center">
        <a
          href={X_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Follow on X"
          title="@eliasing__"
          className="flex items-center justify-center rounded-lg transition-colors"
          style={{
            width: 36,
            height: 36,
            color: "var(--text-faint)",
            border: "1px solid var(--border)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--text)";
            e.currentTarget.style.borderColor = "var(--accent-glow)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--text-faint)";
            e.currentTarget.style.borderColor = "var(--border)";
          }}
        >
          {/* X wordmark — currentColor so it follows the theme */}
          <svg viewBox="0 0 24 24" width={15} height={15} fill="currentColor" aria-hidden="true">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </a>
      </div>
    </footer>
  );
}
