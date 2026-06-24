"use client";

/* ════════════════════════════════════════════════════════════════
   ExportManager — singleton that survives page navigation
   - 1000 items per page
   - 3 second delay between requests
   - 3 retries with 2s backoff on 429/503
   - AbortController for cancellation
   ════════════════════════════════════════════════════════════════ */

export type ExportMode = "futures" | "spot";
export type ExportStatus = "idle" | "running" | "paused" | "done" | "error";

export interface ExportState {
  status: ExportStatus;
  mode: ExportMode;
  walletAddress: string;
  accountId: number;
  fetchedCount: number;
  nextCursor: string | null;
  error: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  data: unknown[];
  perpsSymbolMap: Map<number, string>;
  spotSymbolMap: Map<number, string>;
}

const RATE_LIMIT_MS = 3_000;
const PAGE_SIZE = 1000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2_000;

type Listener = (state: ExportState) => void;

class ExportManager {
  private state: ExportState = {
    status: "idle",
    mode: "futures",
    walletAddress: "",
    accountId: 0,
    fetchedCount: 0,
    nextCursor: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    data: [],
    perpsSymbolMap: new Map(),
    spotSymbolMap: new Map(),
  };

  private listeners = new Set<Listener>();
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private abortController: AbortController | null = null;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => { this.listeners.delete(fn); };
  }

  getState(): ExportState {
    return this.state;
  }

  private setState(partial: Partial<ExportState>) {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((fn) => fn(this.state));
  }

  start(
    mode: ExportMode,
    walletAddress: string,
    accountId: number,
    perpsSymbolMap: Map<number, string> = new Map(),
    spotSymbolMap: Map<number, string> = new Map(),
  ) {
    this.cleanup();
    this.abortController = new AbortController();
    this.setState({
      status: "running",
      mode,
      walletAddress,
      accountId,
      fetchedCount: 0,
      nextCursor: null,
      error: null,
      startedAt: Date.now(),
      finishedAt: null,
      data: [],
      perpsSymbolMap,
      spotSymbolMap,
    });
    this.tick();
  }

  resume() {
    if (this.state.status !== "paused" && this.state.status !== "error") return;
    this.abortController = new AbortController();
    this.setState({ status: "running", error: null });
    this.tick();
  }

  pause() {
    if (this.state.status !== "running") return;
    this.cleanup();
    this.setState({ status: "paused" });
  }

  reset() {
    this.cleanup();
    this.setState({
      status: "idle",
      fetchedCount: 0,
      nextCursor: null,
      error: null,
      startedAt: null,
      finishedAt: null,
      data: [],
    });
  }

  private cleanup() {
    if (this.timeoutId) { clearTimeout(this.timeoutId); this.timeoutId = null; }
    if (this.abortController) { this.abortController.abort(); this.abortController = null; }
  }

  private async fetchWithRetry(url: string, signal: AbortSignal): Promise<Response> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (signal.aborted) throw new Error("Export cancelled");
      const res = await fetch(url, { signal });
      if (res.status === 429 || res.status === 503) {
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }
      }
      return res;
    }
    throw new Error("Max retries exceeded");
  }

  private async tick() {
    if (this.state.status !== "running") return;
    const controller = this.abortController;
    if (!controller) return;

    try {
      const { mode, accountId, nextCursor } = this.state;
      const params = new URLSearchParams({ account_id: String(accountId), limit: String(PAGE_SIZE) });
      if (nextCursor) params.set("cursor", nextCursor);

      const url = mode === "futures"
        ? `/api/perps/positions?${params.toString()}`
        : `/api/spot/trades?${params.toString()}`;

      const res = await this.fetchWithRetry(url, controller.signal);
      if (controller.signal.aborted) return;

      const json = await res.json();
      if (controller.signal.aborted) return;

      if (json.code !== 0) throw new Error(json.message || "API error during export");

      const items: unknown[] = json.data || [];
      const newCursor: string | null = json.meta?.next_cursor ?? null;

      // Client-side cursor fallback using btoa
      let finalCursor = newCursor;
      if (!finalCursor && items.length >= PAGE_SIZE) {
        const last = items[items.length - 1] as Record<string, unknown> | undefined;
        if (last) {
          if (mode === "futures" && last.created_at && last.symbol_id && last.position_id) {
            finalCursor = btoa(`${last.created_at},${last.symbol_id},${last.position_id}`);
          } else if (mode === "spot" && last.ts_ms && last.trade_id && last.symbol_id) {
            finalCursor = btoa(`${last.ts_ms},${last.trade_id},${last.symbol_id}`);
          }
        }
      }

      this.setState({
        data: [...this.state.data, ...items],
        fetchedCount: this.state.fetchedCount + items.length,
        nextCursor: finalCursor,
      });

      if (!finalCursor || items.length < PAGE_SIZE) {
        this.setState({ status: "done", finishedAt: Date.now() });
        return;
      }

      // Schedule next fetch after rate limit delay
      this.timeoutId = setTimeout(() => this.tick(), RATE_LIMIT_MS);
    } catch (err) {
      if (controller.signal.aborted) return;
      this.setState({
        status: "error",
        error: err instanceof Error ? err.message : "Export failed",
      });
    }
  }
}

export const exportManager = new ExportManager();

/* Time estimate helper — 1000 items per page, 3s per request = ~20K items/min */
export function estimateTime(itemCount: number): string {
  const requests = Math.ceil(itemCount / PAGE_SIZE);
  const seconds = requests * (RATE_LIMIT_MS / 1000);
  if (seconds < 60) return `~${Math.ceil(seconds)} seconds`;
  const minutes = seconds / 60;
  if (minutes < 60) return `~${minutes.toFixed(1)} minutes`;
  return `~${(minutes / 60).toFixed(1)} hours`;
}

/* CSV download helper */
export function downloadCSV(headers: string[], rows: (string | number)[][], filename: string) {
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
