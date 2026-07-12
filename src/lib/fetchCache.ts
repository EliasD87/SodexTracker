/**
 * Client-side in-memory fetch cache with TTL.
 * Prevents redundant API calls when navigating between pages.
 */

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const pending = new Map<string, Promise<unknown>>();

/**
 * Fetch a URL and cache the parsed JSON response for `ttl` ms.
 * If a cached entry is still valid, returns it immediately.
 * If a request for the same URL is already in-flight, reuses it.
 */
export async function cachedFetchJson<T>(
  url: string,
  opts?: RequestInit,
  ttl: number = DEFAULT_TTL,
): Promise<T> {
  const key = `${url}|${opts?.method ?? "GET"}|${opts?.body ?? ""}`;

  // Return fresh cache hit
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.data as T;
  }

  // Reuse in-flight request
  const existing = pending.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  // Fire new request
  const promise = (async () => {
    try {
      const res = await fetch(url, opts);
      const json = await res.json();
      cache.set(key, { data: json, expiresAt: Date.now() + ttl });
      return json;
    } finally {
      pending.delete(key);
    }
  })();

  pending.set(key, promise);
  return promise as Promise<T>;
}

/**
 * Like cachedFetchJson but for the apiFetch pattern (checks `code === 0`,
 * throws on error). Retries on 429.
 */
export async function cachedApiFetch<T>(
  url: string,
  retries = 2,
  ttl: number = DEFAULT_TTL,
): Promise<T> {
  const key = `api|${url}`;

  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.data as T;
  }

  const existing = pending.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = (async () => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url);
        if (res.status === 429) {
          if (attempt < retries) {
            await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
            continue;
          }
        }
        const json = await res.json();
        if (json.code !== 0) throw new Error(json.message || "API error");
        const data = json.data as T;
        cache.set(key, { data, expiresAt: Date.now() + ttl });
        return data;
      } catch (err) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
    throw new Error("API error: max retries exceeded");
  })();

  pending.set(key, promise);
  return promise as Promise<T>;
}

/**
 * Clear the entire cache (e.g. on manual refresh).
 */
export function clearFetchCache() {
  cache.clear();
  pending.clear();
}

/**
 * Clear cache entries matching a prefix.
 */
export function clearFetchCachePrefix(prefix: string) {
  for (const key of cache.keys()) {
    if (key.includes(prefix)) cache.delete(key);
  }
}
