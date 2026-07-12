"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Eye, EyeOff, Lock, LogOut, UserRound, Wallet } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type AuthMode = "signin" | "signup";
type MessageTone = "info" | "success" | "error";

function friendlyAuthMessage(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login")) return "That email and password do not match. Try again or create an account.";
  if (lower.includes("email not confirmed")) return "Almost there. Confirm your email, then sign in.";
  if (lower.includes("already registered") || lower.includes("already been registered")) return "This email already has an account. Switch to Sign in.";
  if (lower.includes("email signups are disabled")) return "Email signups are disabled in Supabase. Enable them in Authentication settings.";
  if (lower.includes("rate limit")) return "Too many emails were requested. Wait a bit, then try again.";
  if (lower.includes("password")) return "Password needs at least 6 characters.";
  return message;
}

export function AccountPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [authLoading, setAuthLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<MessageTone>("info");
  const [showPassword, setShowPassword] = useState(false);
  const [groupCount, setGroupCount] = useState(0);
  const [addressCount, setAddressCount] = useState(0);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);

  const loadCounts = async () => {
    if (!supabase) return;
    const [groups, addresses] = await Promise.all([
      supabase.from("watchlist_groups").select("id", { count: "exact", head: true }),
      supabase.from("watchlist_addresses").select("id", { count: "exact", head: true }),
    ]);
    if (!groups.error) setGroupCount(groups.count ?? 0);
    if (!addresses.error) setAddressCount(addresses.count ?? 0);
  };

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (data.user) void loadCounts();
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) void loadCounts();
      else {
        setGroupCount(0);
        setAddressCount(0);
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const handleAuth = async (mode = authMode) => {
    if (!supabase) {
      setMessageTone("error");
      setMessage("Supabase is not connected yet.");
      return;
    }

    const email = emailRef.current?.value.trim() ?? "";
    const password = passwordRef.current?.value ?? "";
    const confirmPassword = confirmPasswordRef.current?.value ?? "";

    if (!email || !password) {
      setMessageTone("error");
      setMessage("Add your email and password first.");
      return;
    }

    if (mode === "signup" && password !== confirmPassword) {
      setMessageTone("error");
      setMessage("Passwords do not match.");
      return;
    }

    setAuthLoading(true);
    setMessage(null);
    setMessageTone("info");
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const result = mode === "signin"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${siteUrl}/account` },
        });

    setAuthLoading(false);
    if (result.error) {
      setMessageTone("error");
      setMessage(friendlyAuthMessage(result.error.message));
      return;
    }

    setMessageTone("success");
    setMessage(mode === "signup" ? "Account created. You can manage your watchlist from the tracker." : "Signed in. Your watchlist sync is ready.");
    if (passwordRef.current) passwordRef.current.value = "";
    if (confirmPasswordRef.current) confirmPasswordRef.current.value = "";
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setMessageTone("info");
    setMessage("Signed out. The tracker can still keep a local watchlist on this browser.");
  };

  return (
    <div className="min-h-screen pt-[72px] pb-20 px-5" style={{ background: "var(--bg)" }}>
      <div className="max-w-[920px] mx-auto">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-5 h-px" style={{ background: "var(--accent)" }} />
            <span className="tag" style={{ color: "var(--accent)" }}>ACCOUNT</span>
          </div>
          <h1 className="text-[30px] sm:text-[44px] font-bold leading-none" style={{ color: "var(--text)" }}>
            Watchlist Account
          </h1>
          <p className="text-sm sm:text-base mt-3 max-w-xl" style={{ color: "var(--text-muted)" }}>
            Sign in to sync saved wallet groups and addresses across devices.
          </p>
        </div>

        <div
          className="grid lg:grid-cols-[0.9fr_1.1fr] overflow-hidden"
          style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}
        >
          <div className="p-6 flex flex-col justify-between gap-8 lg:border-r" style={{ borderColor: "var(--border-subtle)" }}>
            <div>
              <div
                className="flex items-center justify-center mb-5"
                style={{ width: 52, height: 52, border: "1px solid var(--border)", background: "var(--bg)" }}
              >
                {user ? <UserRound size={22} style={{ color: "var(--green)" }} /> : <Lock size={22} style={{ color: "var(--text-faint)" }} />}
              </div>
              <span className="tag" style={{ color: user ? "var(--green)" : "var(--text-faint)" }}>
                {user ? "SIGNED IN" : "SIGNED OUT"}
              </span>
              <h2 className="text-xl font-bold mt-2 break-all" style={{ color: "var(--text)" }}>
                {user ? user.email : "Use email to continue"}
              </h2>
              <p className="text-sm mt-3" style={{ color: "var(--text-muted)" }}>
                {user
                  ? "Your saved wallet groups are connected to this account."
                  : "Passwords are sent directly to Supabase Auth and are not saved locally by the app."}
              </p>
            </div>

            <Link
              href="/tracker"
              className="flex items-center justify-center gap-2 px-4 py-3 tag font-bold"
              style={{ border: "1px solid var(--border)", color: "var(--text)", background: "var(--bg)" }}
            >
              <Wallet size={14} />
              OPEN WATCHLIST
            </Link>
          </div>

          {user ? (
            <div className="p-6 grid content-between gap-6">
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { label: "GROUPS", value: groupCount.toString() },
                  { label: "ADDRESSES", value: addressCount.toString() },
                ].map((item) => (
                  <div key={item.label} className="p-4" style={{ border: "1px solid var(--border)", background: "var(--bg)" }}>
                    <span className="tag" style={{ color: "var(--text-faint)" }}>{item.label}</span>
                    <p className="mono text-2xl font-bold mt-2" style={{ color: "var(--text)" }}>{item.value}</p>
                  </div>
                ))}
              </div>

              <button
                onClick={() => void signOut()}
                className="flex items-center justify-center gap-2 px-4 py-3 tag font-bold"
                style={{ border: "1px solid var(--border)", color: "var(--text)", background: "var(--bg)" }}
              >
                <LogOut size={14} />
                SIGN OUT
              </button>
            </div>
          ) : (
            <div className="p-6">
              <div className="grid grid-cols-2 gap-2 mb-5" style={{ border: "1px solid var(--border)", padding: 3, background: "var(--bg)" }}>
                {(["signin", "signup"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setAuthMode(mode);
                      setMessage(null);
                      setMessageTone("info");
                      if (confirmPasswordRef.current) confirmPasswordRef.current.value = "";
                    }}
                    className="py-2.5 tag font-bold transition-colors"
                    style={{
                      background: authMode === mode ? "var(--accent)" : "transparent",
                      color: authMode === mode ? "var(--accent-fg)" : "var(--text-muted)",
                    }}
                  >
                    {mode === "signin" ? "SIGN IN" : "CREATE ACCOUNT"}
                  </button>
                ))}
              </div>

              <div className="grid gap-4">
                <label className="grid gap-1.5">
                  <span className="tag" style={{ color: "var(--text-faint)" }}>EMAIL</span>
                  <input
                    ref={emailRef}
                    placeholder="you@example.com"
                    type="email"
                    autoComplete="email"
                    className="w-full bg-transparent outline-none text-sm px-4 py-3.5"
                    style={{ border: "1px solid var(--border)", color: "var(--text)", background: "var(--bg)" }}
                  />
                </label>

                <PasswordField
                  inputRef={passwordRef}
                  label="PASSWORD"
                  placeholder={authMode === "signup" ? "Choose a secure password" : "Enter your password"}
                  autoComplete={authMode === "signup" ? "new-password" : "current-password"}
                  showPassword={showPassword}
                  setShowPassword={setShowPassword}
                  onEnter={() => void handleAuth(authMode)}
                />

                {authMode === "signup" && (
                  <PasswordField
                    inputRef={confirmPasswordRef}
                    label="CONFIRM PASSWORD"
                    placeholder="Type it once more"
                    autoComplete="new-password"
                    showPassword={showPassword}
                    setShowPassword={setShowPassword}
                    onEnter={() => void handleAuth("signup")}
                  />
                )}

                <button
                  onClick={() => void handleAuth(authMode)}
                  disabled={authLoading}
                  className="w-full py-3.5 tag font-bold disabled:opacity-50"
                  style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
                >
                  {authLoading ? "WORKING..." : authMode === "signin" ? "SIGN IN" : "CREATE ACCOUNT"}
                </button>
              </div>
            </div>
          )}

          {message && (
            <div
              className="lg:col-span-2 mx-6 mb-6 px-4 py-3 mono text-xs"
              style={{
                border: `1px solid ${messageTone === "error" ? "var(--cal-red-edge)" : messageTone === "success" ? "var(--green-edge)" : "var(--border)"}`,
                background: messageTone === "error" ? "var(--cal-red-tint)" : messageTone === "success" ? "var(--green-tint)" : "var(--bg)",
                color: messageTone === "error" ? "var(--red)" : messageTone === "success" ? "var(--green)" : "var(--text-muted)",
              }}
            >
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PasswordField({
  inputRef,
  label,
  placeholder,
  autoComplete,
  showPassword,
  setShowPassword,
  onEnter,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  label: string;
  placeholder: string;
  autoComplete: string;
  showPassword: boolean;
  setShowPassword: React.Dispatch<React.SetStateAction<boolean>>;
  onEnter: () => void;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="tag" style={{ color: "var(--text-faint)" }}>{label}</span>
      <div className="relative" style={{ border: "1px solid var(--border)", background: "var(--bg)" }}>
        <input
          ref={inputRef}
          onKeyDown={(e) => {
            if (e.key === "Enter") onEnter();
          }}
          placeholder={placeholder}
          type={showPassword ? "text" : "password"}
          autoComplete={autoComplete}
          className="w-full bg-transparent outline-none text-sm py-3.5 pl-4 pr-12"
          style={{ color: "var(--text)" }}
        />
        <button
          type="button"
          onClick={() => setShowPassword((value) => !value)}
          className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-7 h-7"
          style={{ color: "var(--text-faint)" }}
          title={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </label>
  );
}
