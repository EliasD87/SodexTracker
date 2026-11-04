import { count } from "@/lib/analyticsFormat";

/**
 * A wallet's mark, drawn from its address: a two-colour wedge under an offset
 * dot. The hues come from the address, so a wallet always looks the same and
 * neighbours tell apart at a glance. Always decorative: the address is written
 * next to it.
 */
export function Avatar({ address, size = 24, captain, you, dim }: { address: string; size?: number; captain?: boolean; you?: boolean; dim?: boolean }) {
  const h = address.toLowerCase().replace(/^0x/, "").padEnd(40, "0");
  const b = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
  const hue = Math.round(b(10) * 360);
  // The second hue sits well apart from the first; the dot is a lighter third.
  const hue2 = Math.round(hue + 110 + b(12) * 140) % 360;
  const ink = (t: number) => (t < 0.33 ? `hsl(${hue} 62% 56%)` : t < 0.66 ? `hsl(${hue2} 58% 50%)` : `hsl(${(hue + 40) % 360} 70% 74%)`);
  const t1 = 0.1;
  const t2 = 0.5;
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
        background: `radial-gradient(circle at ${dx}% ${dy}%, ${ink(0.9)} 0 22%, transparent calc(22% + 0.6px)), conic-gradient(from ${Math.round(b(0) * 360)}deg, ${ink(t1)} 0 ${split}%, ${ink(t2)} 0)`,
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
