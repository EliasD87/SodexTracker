"use client";

import { useEffect, useState } from "react";
import { cachedApiFetch } from "@/lib/fetchCache";
import { DATA, fetchAccount, fetchChart, type Account, type ChartPoint, type WalletWindow } from "@/lib/wallet/api";

/**
 * The leaderboard's data, all from SoDEX's public API in the browser: the
 * page being read, the top 100 for the scatter and the summary, each other
 * window's top 20 for the badges, and a closer look at the podium. Every
 * request is cached for five minutes, so moving around the page is free.
 */

export type LbWindow = "24H" | "7D" | "30D" | "ALL_TIME";
export type LbSort = "pnl" | "volume";

export const LB_WINDOWS: { value: LbWindow; label: string }[] = [
  { value: "24H", label: "24H" },
  { value: "7D", label: "7D" },
  { value: "30D", label: "30D" },
  { value: "ALL_TIME", label: "All time" },
];

export const PAGE_SIZE = 20;
const TTL = 5 * 60_000;

export interface Row {
  rank: number;
  address: string;
  accountId: number;
  pnl: number;
  volume: number;
}

export interface Page {
  total: number;
  snapshot: number;
  rows: Row[];
}

interface RawPage {
  total: number;
  snapshot_ts: number;
  items: { rank: number; wallet_address: string; account_id: number; pnl_usd: string; volume_usd: string }[];
}

const num = (v: string) => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
};

export function fetchPage(win: LbWindow, sort: LbSort, page: number): Promise<Page> {
  return cachedApiFetch<RawPage>(`${DATA}/leaderboard?window_type=${win}&sort_by=${sort}&page=${page}&page_size=${PAGE_SIZE}`, 2, TTL).then((d) => ({
    total: d.total,
    snapshot: d.snapshot_ts,
    rows: d.items.map((x) => ({ rank: x.rank, address: x.wallet_address, accountId: x.account_id, pnl: num(x.pnl_usd), volume: num(x.volume_usd) })),
  }));
}

export async function fetchRank(win: LbWindow, sort: LbSort, address: string): Promise<Row | null> {
  const d = await cachedApiFetch<{ found: boolean; item?: RawPage["items"][number] }>(
    `${DATA}/leaderboard/rank?window_type=${win}&sort_by=${sort}&wallet_address=${address}`,
    1,
    TTL,
  );
  if (!d.found || !d.item) return null;
  const x = d.item;
  return { rank: x.rank, address: x.wallet_address, accountId: x.account_id, pnl: num(x.pnl_usd), volume: num(x.volume_usd) };
}

/** A promise's state as one value, keyed so a stale answer never lands on a newer view. */
type Loaded<T> = { key: string; data: T | null; error: boolean };

function useLoad<T>(key: string | null, load: () => Promise<T>): { data: T | null; error: boolean; loading: boolean } {
  const [res, setRes] = useState<Loaded<T> | null>(null);
  useEffect(() => {
    if (!key) return;
    let live = true;
    load()
      .then((data) => live && setRes({ key, data, error: false }))
      .catch(() => live && setRes({ key, data: null, error: true }));
    return () => {
      live = false;
    };
    // `load` is rebuilt each render; `key` says when it means something new.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const current = res && res.key === key ? res : null;
  return { data: current?.data ?? null, error: current?.error ?? false, loading: !!key && !current };
}

/** The page being read. */
export function useBoardPage(win: LbWindow, sort: LbSort, page: number) {
  return useLoad(`${win}|${sort}|${page}`, () => fetchPage(win, sort, page));
}

/** The top 100: five pages, the first shared with the board. `pages` reads fewer, where only the top few are shown. */
export function useTop100(win: LbWindow, sort: LbSort, pages = 5) {
  return useLoad(`${win}|${sort}|${pages}`, async () => {
    const list = await Promise.all(Array.from({ length: pages }, (_, i) => fetchPage(win, sort, i + 1).catch(() => null)));
    return list.flatMap((p) => p?.rows ?? []);
  });
}

/** Each window's top 20 by PnL: which windows a wallet places in, for the badges. */
export function useTopEverywhere() {
  return useLoad("everywhere", async () => {
    const lists = await Promise.all(LB_WINDOWS.map((w) => fetchPage(w.value, "pnl", 1).catch(() => null)));
    const where = new Map<string, LbWindow[]>();
    lists.forEach((p, i) => {
      for (const r of p?.rows ?? []) where.set(r.address, [...(where.get(r.address) ?? []), LB_WINDOWS[i].value]);
    });
    return where;
  });
}

export interface Closer {
  account: Account | null;
  chart: ChartPoint[];
}

const chartWindow: Record<LbWindow, WalletWindow> = { "24H": "24H", "7D": "7D", "30D": "30D", ALL_TIME: "1Y" };

/** A closer look at the podium: each account's state and its PnL curve over the window. */
export function usePodiumDetail(rows: Row[], win: LbWindow) {
  const key = rows.length ? `${win}|${rows.map((r) => r.address).join(",")}` : null;
  return useLoad(key, async () => {
    const out = await Promise.all(
      rows.map(async (r): Promise<[string, Closer]> => {
        const [account, chart] = await Promise.all([fetchAccount(r.address).catch(() => null), fetchChart(r.accountId, chartWindow[win]).catch(() => [])]);
        return [r.address, { account, chart }];
      }),
    );
    return new Map(out);
  });
}

/** PnL as a share of volume traded: how hard each dollar of trading worked. 0.002 is 0.2%. */
export const edgeOf = (r: Row) => (r.volume > 0 ? r.pnl / r.volume : null);
