"use client";

import { CornerMarks } from "@/components/CornerMarks";

export function ComingSoon({
  label,
  title,
  description,
}: {
  label: string;
  title: string;
  description: string;
}) {
  return (
    <div className="min-h-screen pt-[72px] pb-20" style={{ background: "var(--bg)" }}>
      <div className="max-w-[1100px] mx-auto px-5">
        <div className="pt-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-5 h-px" style={{ background: "var(--accent)" }} />
            <span className="tag" style={{ color: "var(--accent)" }}>{label}</span>
          </div>
          <h1 className="text-[26px] sm:text-[44px] font-bold leading-none tracking-tight" style={{ color: "var(--text)", letterSpacing: "-0.02em" }}>
            {title}
          </h1>
        </div>

        <div
          className="relative flex flex-col items-center justify-center gap-4 mt-10 py-24"
          style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}
        >
          <CornerMarks size={8} inset={-1} thickness={1} opacity={0.5} />
          <span className="tag text-sm" style={{ color: "var(--accent)" }}>COMING SOON</span>
          <span className="mono text-sm text-center max-w-md px-6" style={{ color: "var(--text-faint)" }}>
            {description}
          </span>
        </div>
      </div>
    </div>
  );
}
