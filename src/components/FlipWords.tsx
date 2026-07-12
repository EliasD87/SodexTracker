"use client";

import { useEffect, useState } from "react";

const WORDS = ["MARKETS", "ADDRESS", "PAIRS", "VOLUME", "LOSSES", "PROFITS"];

/** One split-flap unit: folds the old glyph down, brings the new glyph up. */
function Flap({ prev, next, delay }: { prev: string; next: string; delay: number }) {
  const blank = next === " ";
  return (
    <span className={`flap-unit${blank ? " flap-blank" : ""}`}>
      {/* static halves show the NEXT glyph (revealed as folds clear) */}
      <span className="flap-half flap-top">
        <span className="flap-glyph">{next}</span>
      </span>
      <span className="flap-half flap-bottom">
        <span className="flap-glyph">{prev}</span>
      </span>
      {/* animated folds */}
      <span className="flap-half flap-top fold-down" style={{ animationDelay: `${delay}s` }}>
        <span className="flap-glyph">{prev}</span>
      </span>
      <span className="flap-half flap-bottom fold-up" style={{ animationDelay: `${delay + 0.16}s` }}>
        <span className="flap-glyph">{next}</span>
      </span>
    </span>
  );
}

/** Static (non-flipping) unit for letters that stay the same. */
function StaticFlap({ char }: { char: string }) {
  return (
    <span className="flap-unit">
      <span className="flap-half flap-top">
        <span className="flap-glyph">{char}</span>
      </span>
      <span className="flap-half flap-bottom">
        <span className="flap-glyph">{char}</span>
      </span>
    </span>
  );
}

export function FlipWords() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIdx((p) => (p + 1) % WORDS.length), 2600);
    return () => clearInterval(id);
  }, []);

  const next = WORDS[idx];
  const prev = WORDS[(idx - 1 + WORDS.length) % WORDS.length];
  const len = next.length;

  return (
    <span className="flap-board" aria-label={WORDS[idx].toLowerCase()}>
      {Array.from({ length: len }).map((_, c) => {
        const pc = prev[c] ?? " ";
        const nc = next[c];
        if (pc === nc) return <StaticFlap key={`${idx}-${c}`} char={nc} />;
        return <Flap key={`${idx}-${c}`} prev={pc} next={nc} delay={c * 0.05} />;
      })}
    </span>
  );
}
