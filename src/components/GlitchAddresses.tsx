"use client";

import { useEffect, useRef, useState } from "react";

const HEX = "0123456789abcdef";

function randomAddr(): string {
  let s = "0x";
  for (let i = 0; i < 40; i++) s += HEX[Math.floor(Math.random() * 16)];
  return s;
}

function randomChar(): string {
  return HEX[Math.floor(Math.random() * 16)];
}

export function GlitchAddresses() {
  const [display, setDisplay] = useState("");
  const [glitchPos, setGlitchPos] = useState(-1);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const displayRef = useRef("");

  useEffect(() => {
    displayRef.current = display;
  }, [display]);

  useEffect(() => {
    let mounted = true;

    const pushTimer = (t: ReturnType<typeof setTimeout>) => {
      timersRef.current.push(t);
      return t;
    };

    const tick = () => {
      if (!mounted) return;
      const current = displayRef.current;
      const chars = current.split("");
      const idx = 2 + Math.floor(Math.random() * 40);
      const newChar = randomChar();

      chars[idx] = newChar;
      setGlitchPos(idx);
      setDisplay(chars.join(""));

      const t = setTimeout(() => {
        if (!mounted) return;
        setGlitchPos(-1);
        const next = setTimeout(tick, 50 + Math.random() * 200);
        pushTimer(next);
      }, 80);
      pushTimer(t);
    };

    const initial = randomAddr();
    displayRef.current = initial;
    setDisplay(initial);

    const start = setTimeout(tick, 600);
    pushTimer(start);

    return () => {
      mounted = false;
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, []);

  return (
    <div className="inline-flex items-center text-[11px] mono mb-8 fade-up fade-up-1">
      <span
        style={{
          color: "var(--text-faint)",
          letterSpacing: "0.02em",
        }}
      >
        {display.split("").map((ch, i) => (
          <span
            key={i}
            style={{
              color: glitchPos === i ? "var(--accent)" : "var(--text-faint)",
              textShadow:
                glitchPos === i
                  ? "1px 0 var(--red), -1px 0 var(--accent-bright)"
                  : "none",
              transition: "color 0.05s ease",
            }}
          >
            {ch}
          </span>
        ))}
      </span>
    </div>
  );
}
