"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useConnect, useConnection, useConnectors, useDisconnect, type Connector } from "wagmi";
import { Wallet, X, Copy, Check, LogOut, ArrowUpRight, Loader2 } from "lucide-react";

/**
 * Connect / connected control for the navbar, plus the wallet picker.
 *
 * Connecting only reads the address. Nothing here asks the wallet to sign or
 * switch network, so it is safe to offer everywhere.
 */

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const noopSubscribe = () => () => {};

/** The generic injected connector duplicates whichever named wallet it wraps. */
function listable(connectors: readonly Connector[]): Connector[] {
  const named = connectors.filter((c) => c.id !== "injected");
  return named.length ? named : [...connectors];
}

function WalletPicker({ onClose }: { onClose: () => void }) {
  const connectors = useConnectors();
  const { mutate: connect, isPending, variables, error, reset } = useConnect();
  const { isConnected } = useConnection();
  const wallets = listable(connectors);

  useEffect(() => {
    if (isConnected) onClose();
  }, [isConnected, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pendingId = isPending ? (variables?.connector as Connector | undefined)?.id : undefined;
  // A rejected prompt is the user changing their mind, not a fault to report.
  const rejected = error && /reject|denied|cancel/i.test(error.message);

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-5">
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Connect a wallet"
        className="relative w-full sm:w-[380px] p-5 sm:rounded-2xl rounded-t-2xl"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "0 24px 60px rgba(0,0,0,0.4)" }}
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="text-[17px] font-bold tracking-tight" style={{ color: "var(--text)" }}>
            Connect a wallet
          </h2>
          <button onClick={onClose} aria-label="Close" className="p-1 -m-1 rounded-md" style={{ color: "var(--text-faint)" }}>
            <X size={17} />
          </button>
        </div>
        <p className="text-[12.5px] mb-4" style={{ color: "var(--text-muted)" }}>
          Read-only. SoDEX Tracker only sees your address. Nothing is signed and no funds move.
        </p>

        {wallets.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {wallets.map((c) => {
              const pending = pendingId === c.id;
              return (
                <button
                  key={c.uid}
                  disabled={isPending}
                  onClick={() => {
                    reset();
                    connect({ connector: c });
                  }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors disabled:opacity-60"
                  style={{ border: "1px solid var(--border)", background: "var(--bg)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent-glow)")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                >
                  {c.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.icon} alt="" width={28} height={28} className="rounded-lg shrink-0" />
                  ) : (
                    <span
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
                    >
                      <Wallet size={14} />
                    </span>
                  )}
                  <span className="flex-1 text-[13.5px] font-semibold" style={{ color: "var(--text)" }}>
                    {c.id === "injected" ? "Browser wallet" : c.name}
                  </span>
                  {pending && (
                    <span className="flex items-center gap-1.5 tag" style={{ color: "var(--text-faint)" }}>
                      <Loader2 size={12} className="animate-spin" /> CHECK WALLET
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="px-3 py-4 rounded-xl text-[12.5px] leading-relaxed" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
            No wallet found in this browser. Install{" "}
            <a href="https://rabby.io" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" style={{ color: "var(--text)" }}>Rabby</a>{" "}
            or{" "}
            <a href="https://metamask.io" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" style={{ color: "var(--text)" }}>MetaMask</a>
            , or on a phone, open this page inside your wallet app&apos;s browser.
          </div>
        )}

        {error && !rejected && (
          <p className="mt-3 text-[12px]" style={{ color: "var(--red)" }}>
            {error.message.split("\n")[0]}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}

function ConnectedMenu({ address, onClose }: { address: string; onClose: () => void }) {
  const { mutate: disconnect } = useDisconnect();
  const [copied, setCopied] = useState(false);

  return (
    <>
      <div className="fixed inset-0 z-[65]" onClick={onClose} />
      <div
        className="absolute right-0 top-full mt-1.5 z-[66] w-[220px] p-2 flex flex-col gap-1"
        style={{
          background: "var(--panel-bg)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
          border: "1px solid var(--border)", boxShadow: "0 12px 36px rgba(0,0,0,0.28)", borderRadius: 12,
        }}
      >
        <div className="flex items-center gap-1.5 px-2 py-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--green)" }} />
          <span className="mono text-[11.5px] font-semibold truncate" style={{ color: "var(--text)" }} title={address}>
            {short(address)}
          </span>
        </div>
        <Link
          href="/portfolio"
          onClick={onClose}
          className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[12.5px] font-medium"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-elevated)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <ArrowUpRight size={14} /> My portfolio
        </Link>
        <button
          onClick={() => {
            void navigator.clipboard?.writeText(address).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            });
          }}
          className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[12.5px] font-medium text-left"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-elevated)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          {copied ? <Check size={14} style={{ color: "var(--green)" }} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy address"}
        </button>
        <button
          onClick={() => {
            disconnect();
            onClose();
          }}
          className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[12.5px] font-medium text-left"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-elevated)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <LogOut size={14} /> Disconnect
        </button>
      </div>
    </>
  );
}

/**
 * `variant="full"` is the labelled desktop button; `"icon"` is the square
 * mobile one that sits beside the watchlist and account icons; `"hero"` is the
 * full-width primary action on the empty portfolio page.
 */
export function ConnectWallet({ variant = "full" }: { variant?: "full" | "icon" | "hero" }) {
  const { address, status } = useConnection();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // wagmi resolves the wallet after hydration; until then render the
  // disconnected shape so server and client markup agree.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const connected = mounted && status === "connected" && !!address;

  if (variant === "hero") {
    // Once connected the portfolio switches to the wallet, so this never
    // needs a connected state of its own.
    return (
      <>
        <button
          onClick={() => setPickerOpen(true)}
          className="sheen-host w-full flex items-center justify-center gap-2 py-4 text-sm font-bold transition-opacity hover:opacity-90"
          style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
        >
          <Wallet size={16} /> Connect wallet
        </button>
        {pickerOpen && <WalletPicker onClose={() => setPickerOpen(false)} />}
      </>
    );
  }

  if (variant === "icon") {
    return (
      <div className="relative">
        <button
          onClick={() => (connected ? setMenuOpen((v) => !v) : setPickerOpen(true))}
          className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors"
          style={{ color: connected ? "var(--green)" : "var(--text-muted)", background: menuOpen ? "var(--bg-elevated)" : "transparent" }}
          aria-label={connected ? "Wallet menu" : "Connect wallet"}
        >
          <Wallet size={18} />
        </button>
        {connected && menuOpen && <ConnectedMenu address={address} onClose={() => setMenuOpen(false)} />}
        {pickerOpen && <WalletPicker onClose={() => setPickerOpen(false)} />}
      </div>
    );
  }

  return (
    <div className="relative">
      {connected ? (
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-lg text-[12.5px] font-semibold mono transition-colors"
          style={{ border: "1px solid var(--border)", color: "var(--text)", background: menuOpen ? "var(--bg-elevated)" : "var(--bg-surface)" }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--green)" }} />
          {short(address)}
        </button>
      ) : (
        <button
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-colors whitespace-nowrap"
          style={{ border: "1px solid var(--border)", color: "var(--text)", background: "var(--bg-surface)" }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent-glow)")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
        >
          <Wallet size={14} /> Connect
        </button>
      )}
      {connected && menuOpen && <ConnectedMenu address={address} onClose={() => setMenuOpen(false)} />}
      {pickerOpen && <WalletPicker onClose={() => setPickerOpen(false)} />}
    </div>
  );
}
