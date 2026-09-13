import Link from "next/link";

/**
 * The quiet end of every page — the privacy policy and a single X link.
 *
 * Rendered from the root layout, so it sits outside <main> and misses the
 * mobile bottom-nav clearance that <main> gets; hence its own pb on small
 * screens. Deliberately not the old CTAFooter, which is imported nowhere and
 * still carries dead "#markets" anchors and a button that goes nowhere.
 */

const X_URL = "https://x.com/eliasing__";

export function SiteFooter() {
  return (
    <footer
      className="pt-10 pb-28 md:pb-10 border-t"
      style={{ borderColor: "var(--border-subtle)" }}
    >
      <div className="max-w-[1200px] mx-auto px-5 flex items-center justify-center gap-5">
        <Link
          href="/privacy-policy"
          className="footer-link text-xs transition-colors"
        >
          Privacy Policy
        </Link>

        <span aria-hidden="true" style={{ color: "var(--text-faint)", opacity: 0.5 }}>
          ·
        </span>

        <a
          href={X_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Follow on X"
          title="@eliasing__"
          className="footer-link flex items-center justify-center rounded-lg transition-colors"
          style={{ width: 32, height: 32, border: "1px solid var(--border)" }}
        >
          {/* X wordmark — currentColor so it follows the theme */}
          <svg viewBox="0 0 24 24" width={14} height={14} fill="currentColor" aria-hidden="true">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </a>
      </div>
    </footer>
  );
}
