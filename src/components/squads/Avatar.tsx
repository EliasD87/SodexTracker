import { count } from "@/lib/analyticsFormat";

/**
 * A wallet's mark, drawn from its address in shades of the text colour only:
 * a two-tone wedge under an offset dot. Inverts with the theme, carries no
 * hue (colour would mean nothing here). Always decorative: the address is
 * written next to it.
 */
export function Avatar({ address, size = 24, captain, you, dim }: { address: string; size?: number; captain?: boolean; you?: boolean; dim?: boolean }) {
  const h = address.toLowerCase().replace(/^0x/, "").padEnd(40, "0");
  const b = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
  const ink = (t: number) => `color-mix(in srgb, var(--text) ${Math.round(16 + t * 70)}%, var(--bg-surface))`;
  const t1 = b(10);
  // The second shade is always well apart from the first.
  const t2 = (t1 + 0.35 + b(12) * 0.3) % 1;
  const split = Math.round(28 + b(2) * 44);
  const dx = Math.round(28 + b(4) * 44);
  const dy = Math.round(28 + b(6) * 44);
  const ring = captain ? ", 0 0 0 3.5px var(--text)" : you ? ", 0 0 0 3.5px var(--text-muted)" : "";
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        opacity: dim ? 0.45 : 1,
        background: `radial-gradient(circle at ${dx}% ${dy}%, ${ink(b(8))} 0 22%, transparent calc(22% + 0.6px)), conic-gradient(from ${Math.round(b(0) * 360)}deg, ${ink(t1)} 0 ${split}%, ${ink(t2)} 0)`,
        boxShadow: `0 0 0 2px var(--bg-surface)${ring}`,
        ...(dim ? { outline: "1px dashed var(--text-faint)", outlineOffset: 1 } : null),
      }}
    />
  );
}

/** A squad at a glance: the first few people overlapping, then "+N". */
export function AvatarStack({ people, total, max = 6, size = 20 }: { people: { address: string; captain?: boolean }[]; total: number; max?: number; size?: number }) {
  const shown = people.slice(0, max);
  const rest = total - shown.length;
  return (
    <span className="inline-flex items-center" aria-hidden>
      {shown.map((p, i) => (
        <span key={p.address} className="inline-flex" style={{ marginLeft: i ? -6 : 0, zIndex: max - i }}>
          <Avatar address={p.address} size={size} captain={p.captain} />
        </span>
      ))}
      {rest > 0 && (
        <span
          className="inline-flex items-center justify-center min-w-[20px] px-1.5 text-[10px] font-semibold mono"
          style={{ height: size, marginLeft: -6, borderRadius: 9999, background: "var(--bg-elevated)", color: "var(--text-muted)", boxShadow: "0 0 0 2px var(--bg-surface)" }}
        >
          +{count(rest)}
        </span>
      )}
    </span>
  );
}
