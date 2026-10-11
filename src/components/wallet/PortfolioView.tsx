"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Cloud, HardDrive, MoreHorizontal, Pencil, Plus, Trash2, X } from "lucide-react";
import { isAddress } from "@/lib/watchlistAddress";
import { usePortfolio, WALLET_ENTRY_ID, type SavedPortfolioAddress } from "@/components/PortfolioProvider";
import { ConnectWallet } from "@/components/ConnectWallet";
import { CARD_STYLE } from "@/components/analytics/kit";
import { WalletView } from "@/components/wallet/WalletView";
import { useWalletSummary } from "@/components/wallet/useWallet";
import { fmtUsd, Identicon, LoadingDots, signedUsd, tone } from "@/components/wallet/ui";

type Summary = { netWorth: number | null; complete: boolean; pnlAll: number | null };

/**
 * One saved wallet as a slim chip: name, net worth and all-time PnL on one
 * line, with rename and remove behind a small menu.
 */
function WalletChip({
  entry,
  index,
  active,
  onSelect,
  onSummary,
}: {
  entry: SavedPortfolioAddress;
  index: number;
  active: boolean;
  onSelect: () => void;
  onSummary: (address: string, s: Summary) => void;
}) {
  const s = useWalletSummary(entry.address);
  const { renameAddress, removeAddress } = usePortfolio();
  const [mode, setMode] = useState<"idle" | "menu" | "rename" | "remove">("idle");
  const [name, setName] = useState(entry.label ?? "");
  const ref = useRef<HTMLDivElement>(null);
  const isWallet = entry.id === WALLET_ENTRY_ID;
  const title = isWallet ? "Connected wallet" : entry.label || `Wallet ${index + 1}`;

  useEffect(() => {
    onSummary(entry.address, { netWorth: s.netWorth, complete: s.complete, pnlAll: s.pnlAll });
  }, [entry.address, s.netWorth, s.complete, s.pnlAll, onSummary]);

  useEffect(() => {
    if (mode !== "menu") return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setMode("idle");
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [mode]);

  return (
    <div
      ref={ref}
      className="relative flex items-center gap-2.5 h-[60px] pl-3 pr-1.5 min-w-0"
      style={{ ...CARD_STYLE, borderRadius: 14, borderColor: active ? "var(--text)" : "var(--border)", boxShadow: active ? "0 0 0 1px var(--text)" : CARD_STYLE.boxShadow }}
    >
      {mode === "rename" ? (
        <form
          className="flex-1 flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            renameAddress(entry.id, name);
            setMode("idle");
          }}
        >
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setMode("idle")} placeholder="Name this wallet" aria-label="Wallet name" className="flex-1 min-w-0 h-8 px-2 rounded-[8px] bg-transparent outline-none text-[13px]" style={{ border: "1px solid var(--border)", color: "var(--text)" }} />
          <button type="submit" aria-label="Save name" className="h-8 w-8 inline-flex items-center justify-center rounded-[8px]" style={{ background: "var(--text)", color: "var(--bg)" }}>
            <Check size={14} />
          </button>
        </form>
      ) : mode === "remove" ? (
        <div className="flex-1 flex items-center gap-1.5 text-[12.5px]">
          <span className="mr-auto truncate" style={{ color: "var(--text)" }}>
            {isWallet ? "Disconnect?" : `Remove ${title}?`}
          </span>
          <button type="button" onClick={() => removeAddress(entry.id)} className="h-8 px-2.5 rounded-[8px] text-[12px] font-semibold" style={{ background: "var(--red)", color: "#fff" }}>
            {isWallet ? "Disconnect" : "Remove"}
          </button>
          <button type="button" aria-label="Keep it" onClick={() => setMode("idle")} className="h-8 w-8 inline-flex items-center justify-center rounded-[8px]" style={{ color: "var(--text-muted)" }}>
            <X size={14} />
          </button>
        </div>
      ) : (
        <>
          <button type="button" onClick={onSelect} aria-pressed={active} aria-label={`Show ${title}`} className="absolute inset-0 rounded-[inherit]" />
          <Identicon address={entry.address} size={30} />
          <span className="relative min-w-0 flex-1 pointer-events-none">
            <span className="flex items-center gap-1.5 text-[13px] font-medium truncate" style={{ color: "var(--text)" }}>
              {title}
              {isWallet && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--green)" }} aria-label="connected" />}
            </span>
            <span className="flex items-center gap-2 text-[11.5px] mono">
              {s.error ? (
                <span style={{ color: "var(--text-faint)" }}>Not on SoDEX yet</span>
              ) : s.netWorth == null ? (
                <LoadingDots />
              ) : (
                <>
                  <span style={{ color: "var(--text)" }}>{fmtUsd(s.netWorth)}</span>
                  {!s.complete && <LoadingDots label="Still adding up" />}
                  {s.pnlAll != null && <span style={{ color: tone(s.pnlAll) }}>{signedUsd(s.pnlAll)}</span>}
                </>
              )}
            </span>
          </span>
          <button type="button" aria-label={`Options for ${title}`} aria-expanded={mode === "menu"} onClick={() => setMode(mode === "menu" ? "idle" : "menu")} className="relative h-8 w-8 inline-flex items-center justify-center rounded-[9px] hover:bg-[var(--bg-elevated)]" style={{ color: "var(--text-muted)" }}>
            <MoreHorizontal size={16} />
          </button>
          {mode === "menu" && (
            <div role="menu" className="absolute left-1 right-1 sm:left-auto top-[56px] z-30 sm:w-[170px] p-1" style={{ ...CARD_STYLE, borderRadius: 12, boxShadow: "0 12px 32px rgba(0,0,0,0.25)" }}>
              {!isWallet && (
                <button type="button" className="w-full flex items-center gap-2 px-3 py-2.5 sm:py-2 text-[13px] sm:text-[12.5px] rounded-[8px] hover:bg-[var(--bg-elevated)]" style={{ color: "var(--text)" }} onClick={() => (setName(entry.label ?? ""), setMode("rename"))}>
                  <Pencil size={14} /> Rename
                </button>
              )}
              <button type="button" className="w-full flex items-center gap-2 px-3 py-2.5 sm:py-2 text-[13px] sm:text-[12.5px] rounded-[8px] hover:bg-[var(--bg-elevated)]" style={{ color: "var(--red)" }} onClick={() => setMode("remove")}>
                <Trash2 size={14} /> {isWallet ? "Disconnect" : "Remove"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Paste an address and add it. `big` is the empty state's always-open version. */
function AddWallet({ onAdd, big = false, onClose }: { onAdd: (a: string) => void; big?: boolean; onClose?: () => void }) {
  const [q, setQ] = useState("");
  const [bad, setBad] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!isAddress(q.trim())) return setBad(true);
        onAdd(q.trim());
        setQ("");
        onClose?.();
      }}
      className={big ? "flex flex-col gap-2 p-4" : "flex items-center gap-1.5 h-[60px] pl-2 pr-1.5"}
      style={big ? undefined : { ...CARD_STYLE, borderRadius: 14 }}
    >
      <input
        autoFocus={!big}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setBad(false);
        }}
        onKeyDown={(e) => e.key === "Escape" && onClose?.()}
        placeholder="0x… wallet address"
        aria-label="Wallet address to add"
        aria-invalid={bad}
        spellCheck={false}
        className={`${big ? "h-10" : "h-9 flex-1 min-w-0"} px-3 rounded-[10px] outline-none text-[13px] mono`}
        style={{ border: `1px solid ${bad ? "var(--red)" : "var(--border)"}`, color: "var(--text)", background: "var(--bg-surface)" }}
      />
      {bad && big && (
        <p role="alert" className="text-[11.5px]" style={{ color: "var(--red)" }}>
          That isn&apos;t a wallet address.
        </p>
      )}
      <button type="submit" className={`${big ? "h-9" : "h-9 px-3"} rounded-[10px] text-[13px] font-semibold shrink-0`} style={{ background: "var(--text)", color: "var(--bg)" }}>
        Add
      </button>
      {!big && (
        <button type="button" aria-label="Cancel" onClick={onClose} className="h-9 w-8 inline-flex items-center justify-center shrink-0" style={{ color: "var(--text-muted)" }}>
          <X size={14} />
        </button>
      )}
    </form>
  );
}

/** /portfolio: your own wallets, together and one by one. */
export function PortfolioView() {
  const { addresses, activeId, loaded, synced, switchAddress, addAddress } = usePortfolio();
  const [sums, setSums] = useState<Record<string, Summary>>({});
  const [adding, setAdding] = useState(false);
  const onSummary = useState(
    () => (address: string, s: Summary) =>
      setSums((m) => (m[address]?.netWorth === s.netWorth && m[address]?.pnlAll === s.pnlAll && m[address]?.complete === s.complete ? m : { ...m, [address]: s })),
  )[0];

  if (!loaded) return <main className="max-w-[1240px] mx-auto px-4 sm:px-6 pt-[96px] pb-20" aria-busy="true" />;

  if (!addresses.length) {
    return (
      <main className="max-w-[1240px] mx-auto px-4 sm:px-6 pt-[84px] sm:pt-[96px] pb-20">
        <section className="pt-6 sm:pt-12 max-w-[560px] mx-auto text-center">
          <h1 className="text-[32px] sm:text-[44px] font-semibold leading-[1.05]" style={{ color: "var(--text)", letterSpacing: "-0.035em" }}>
            Your wallets, in one place
          </h1>
          <p className="mt-3 text-[14px]" style={{ color: "var(--text-muted)" }}>
            Connect or paste the wallets you use on SoDEX. See what they&apos;re worth together, and each one in full. Nothing to sign, read-only.
          </p>
          <div className="mt-7 flex justify-center">
            <ConnectWallet variant="hero" />
          </div>
          <div className="my-5 flex items-center gap-3 text-[11.5px]" style={{ color: "var(--text-faint)" }}>
            <span className="flex-1 h-px" style={{ background: "var(--border)" }} />
            or paste an address
            <span className="flex-1 h-px" style={{ background: "var(--border)" }} />
          </div>
          <div className="text-left" style={CARD_STYLE}>
            <AddWallet big onAdd={addAddress} />
          </div>
          <p className="mt-4 text-[12px]" style={{ color: "var(--text-faint)" }}>
            Saved on this device. <Link href="/account" className="underline underline-offset-2">Sign in</Link> to keep them across devices.
          </p>
        </section>
      </main>
    );
  }

  const active = addresses.find((a) => a.id === activeId) ?? addresses[0];
  const known = addresses.map((a) => sums[a.address]).filter((s): s is Summary => !!s && s.netWorth != null);
  const total = known.reduce((a, s) => a + (s.netWorth ?? 0), 0);
  const pnl = known.reduce((a, s) => a + (s.pnlAll ?? 0), 0);
  const allIn = known.length === addresses.length && known.every((s) => s.complete);

  return (
    <main className="max-w-[1240px] mx-auto px-4 sm:px-6 pt-[80px] sm:pt-[88px] pb-20">
      {/* One slim row: the title, where the list lives, and the combined total. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-[20px] sm:text-[22px] font-semibold" style={{ color: "var(--text)", letterSpacing: "-0.02em" }}>
            My wallets
          </h1>
          <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: "var(--text-faint)" }}>
            {synced ? <Cloud size={12} /> : <HardDrive size={12} />}
            {synced ? (
              "Synced to your account"
            ) : (
              <>
                This device only · <Link href="/account" className="underline underline-offset-2">sign in</Link> to sync
              </>
            )}
          </span>
        </div>
        {addresses.length > 1 && (
          <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
            <span style={{ color: "var(--text-muted)" }}>All {addresses.length} together</span>
            <span className="font-semibold tabular-nums" style={{ color: "var(--text)" }}>
              {known.length ? fmtUsd(total) : <LoadingDots />}
            </span>
            {!allIn && known.length > 0 && <LoadingDots label="Still adding up" />}
            {known.length > 0 && (
              <span className="mono text-[12px]" style={{ color: tone(pnl) }}>
                {signedUsd(pnl)} all time
              </span>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {addresses.map((a, i) => (
          <WalletChip key={a.id} entry={a} index={i} active={a.id === active.id} onSelect={() => switchAddress(a.id)} onSummary={onSummary} />
        ))}
        {adding ? (
          <AddWallet onAdd={addAddress} onClose={() => setAdding(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center justify-center gap-1.5 h-[60px] text-[13px] font-medium transition-colors hover:bg-[var(--bg-elevated)]"
            style={{ border: "1px dashed var(--border)", borderRadius: 14, color: "var(--text-muted)" }}
          >
            <Plus size={15} /> Add a wallet
          </button>
        )}
      </div>

      <div className="mt-2">
        <WalletView key={active.address} address={active.address} label={active.id === WALLET_ENTRY_ID ? "Connected wallet" : active.label} actions={<span />} />
      </div>
    </main>
  );
}
