"use client";

import { useEffect, useState } from "react";
import { chainRows, holdingRows, walletWealth } from "@/lib/wallet/derive";
import {
  fetchAccount,
  fetchActivity,
  fetchChainWallet,
  fetchChart,
  fetchMarkets,
  fetchOverview,
  fetchRanks,
  fetchSpotBalances,
  fetchStaked,
  fetchTransfers,
  fetchWealth,
  type Account,
  type WalletWindow,
} from "@/lib/wallet/api";

export interface Res<T> {
  data: T | null;
  error: string | null;
  /** True while the current key is loading; `data` may still hold the previous key's answer. */
  loading: boolean;
  /** When `data` arrived. */
  at: number | null;
}

/**
 * One piece of a wallet, loaded on its own so the page fills in as answers
 * arrive. While the key changes (a new window, a refresh) the last answer
 * stays, and the section dims instead of blanking.
 */
function useResource<T>(key: string | null, load: () => Promise<T>): Res<T> {
  const [state, setState] = useState<{ key: string | null; data: T | null; error: string | null; at: number | null }>({ key: null, data: null, error: null, at: null });
  useEffect(() => {
    if (!key) return;
    let live = true;
    load()
      .then((data) => live && setState({ key, data, error: null, at: Date.now() }))
      .catch((e: unknown) => live && setState((s) => ({ key, data: s.data, at: s.at, error: e instanceof Error ? e.message : "Couldn't load this" })));
    return () => {
      live = false;
    };
    // `load` is rebuilt every render; the key says when it means something new.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { data: key ? state.data : null, error: state.key === key ? state.error : null, loading: !!key && state.key !== key, at: key ? state.at : null };
}

/** Everything the wallet page shows, each part independent. `nonce` changes on refresh. */
export function useWallet(address: string | null, win: WalletWindow, nonce: number) {
  const k = (part: string) => (address ? `${part}|${address}|${nonce}` : null);

  const account = useResource<Account>(k("account"), () => fetchAccount(address!));
  const aid = account.data?.address === address ? account.data.accountId : null;
  const ak = (part: string) => (address && aid != null ? `${part}|${aid}|${nonce}` : null);

  const markets = useResource(`markets|${nonce}`, fetchMarkets);
  const overview = useResource(ak(`overview|${win}`), () => fetchOverview(aid!, win));
  const chart = useResource(ak(`chart|${win}`), () => fetchChart(aid!, win));
  // The day-by-day calendar always covers the year, whatever the window.
  const chartYear = useResource(ak("chart|1Y"), () => fetchChart(aid!, "1Y"));
  const ranks = useResource(k("ranks"), () => fetchRanks(address!));
  const balances = useResource(k("balances"), () => fetchSpotBalances(address!));
  const staked = useResource(k("staked"), () => fetchStaked(address!));
  const wealth = useResource(k("wealth"), () => fetchWealth(address!));
  const transfers = useResource(k("transfers"), () => fetchTransfers(address!));
  const chain = useResource(k("chain"), () => fetchChainWallet(address!));
  const activity = useResource(markets.data && aid != null ? `activity|${aid}|${nonce}` : null, () => fetchActivity(aid!, markets.data!));

  return { account, markets, overview, chart, chartYear, ranks, balances, staked, wealth, transfers, chain, activity, accountId: aid };
}

export type WalletData = ReturnType<typeof useWallet>;

/** The few figures a wallet tile needs: net worth across SoDEX and all-time PnL. */
export function useWalletSummary(address: string) {
  const k = (part: string) => `${part}|${address}|0`;
  const account = useResource(k("account"), () => fetchAccount(address));
  const markets = useResource("markets|0", fetchMarkets);
  const balances = useResource(k("balances"), () => fetchSpotBalances(address));
  const staked = useResource(k("staked"), () => fetchStaked(address));
  const wealth = useResource(k("wealth"), () => fetchWealth(address));
  const chain = useResource(k("chain"), () => fetchChainWallet(address));
  const aid = account.data?.accountId ?? null;
  const overview = useResource(aid != null ? `overview|1Y|${aid}|0` : null, () => fetchOverview(aid!, "1Y"));

  const m = markets.data;
  const spot = balances.data && m ? holdingRows(balances.data, 0, m).reduce((a, r) => a + (r.value ?? 0), 0) : null;
  const stakedUsd = staked.data != null && m ? staked.data * (m.spotPrices.get("WSOSO") ?? 0) : null;
  // Fund shares in spot or perps are counted once, under Wealth, as on the wallet page.
  const wh = walletWealth(wealth.data, !!wealth.error, balances.data, m);
  const parts = [
    account.data ? account.data.perpsEquity - (wh?.inPerps ?? 0) : null,
    spot,
    stakedUsd,
    wh ? wh.total : null,
    // The chain wallet is a bonus: if its explorer is down, the rest still adds up.
    chain.data && m ? chainRows(chain.data, m).reduce((a, r) => a + (r.value ?? 0), 0) : chain.error ? 0 : null,
  ];
  // A part that failed counts as nothing rather than holding the tile back.
  const failed = [account.error, balances.error, staked.error, wealth.error && balances.error, chain.error];
  const settled = parts.map((p, i) => p ?? (failed[i] ? 0 : null));
  return {
    /** The sum of what's in so far: null only until the account itself loads. */
    netWorth: account.data ? settled.reduce((a: number, p) => a + Math.max(0, p ?? 0), 0) : null,
    complete: settled.every((p) => p != null),
    pnlAll: overview.data?.pnl ?? null,
    error: account.error,
  };
}
