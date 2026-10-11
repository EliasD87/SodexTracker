"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cachedApiFetch } from "@/lib/fetchCache";
// Types only: the analytics module itself is server code and stays out of the bundle.
import type { WindowKey, ExchangeAnalytics } from "@/lib/exchangeAnalytics";

export const WINDOW_KEYS: WindowKey[] = ["7D", "30D", "90D", "1Y"];

/**
 * True on phone-sized screens (under 640px, Tailwind's `sm`), for the few
 * places where a phone gets a different layout rather than a smaller one.
 * Always false on the server and the first paint, so hydration matches.
 */
export function useCompact(maxWidth = 639): boolean {
  const query = `(max-width: ${maxWidth}px)`;
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * The window lives in the URL (?w=30D), so it survives switching tabs, opening
 * a market and sharing a link.
 */
export function useAnalyticsWindow(): [WindowKey, (w: WindowKey) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("w") ?? "30D";
  const win: WindowKey = (WINDOW_KEYS as string[]).includes(raw) ? (raw as WindowKey) : "30D";

  const setWin = useCallback(
    (w: WindowKey) => {
      const next = new URLSearchParams(params.toString());
      next.set("w", w);
      router.replace(`${pathname}?${next}`, { scroll: false });
    },
    [params, pathname, router],
  );
  return [win, setWin];
}

/**
 * Fetch through the shared client cache. While a new URL loads, the previous
 * data stays in place so views can dim instead of flashing a skeleton.
 */
export function useApi<T>(url: string | null, ttlMs: number, refreshMs?: number) {
  const [res, setRes] = useState<{ url: string | null; data: T | null; error: string | null }>({
    url: null,
    data: null,
    error: null,
  });

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const load = () =>
      cachedApiFetch<T>(url, 1, ttlMs)
        .then((data) => !cancelled && setRes({ url, data, error: null }))
        .catch((e) =>
          !cancelled &&
          setRes((prev) => ({ url, data: prev.data, error: e instanceof Error ? e.message : "Could not load" })),
        );
    load();
    const id = refreshMs ? setInterval(load, refreshMs) : null;
    return () => {
      cancelled = true;
      if (id) clearInterval(id);
    };
  }, [url, ttlMs, refreshMs]);

  return { data: res.data, error: res.url === url ? res.error : null, loading: res.url !== url };
}

const EXCHANGE_TTL = 10 * 60 * 1000;

export function useExchangeAnalytics(win: WindowKey) {
  return useApi<ExchangeAnalytics>(`/api/analytics/exchange?window=${win}`, EXCHANGE_TTL);
}
