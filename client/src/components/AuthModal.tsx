import { useEffect, useState } from "react";
import { login, register } from "../api";
import type { AuthUser } from "../types";
import { XIcon, BoltIcon } from "./icons";
import { GoogleButton } from "./GoogleButton";

const hasGoogle = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;

export function AuthModal({
  onClose,
  onAuthed,
}: {
  onClose: () => void;
  onAuthed: (user: AuthUser) => void;
}) {
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user =
        tab === "signup"
          ? await register(email, password, name || undefined)
          : await login(email, password);
      onAuthed(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="glass w-full max-w-sm rounded-2xl p-6"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg border border-white/15 bg-white/5">
              <BoltIcon className="h-4 w-4 text-brand-light" />
            </span>
            <span className="text-[15px] font-semibold">
              {tab === "signup" ? "Create your account" : "Welcome back"}
            </span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200">
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {hasGoogle && (
          <>
            <div className="mb-4 flex justify-center">
              <GoogleButton onAuthed={onAuthed} onError={setError} />
            </div>
            <div className="mb-4 flex items-center gap-3 text-xs text-slate-500">
              <span className="h-px flex-1 bg-white/10" />
              or
              <span className="h-px flex-1 bg-white/10" />
            </div>
          </>
        )}

        <div className="mb-4 flex rounded-lg border border-white/10 bg-white/5 p-0.5 text-sm">
          {(["signin", "signup"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setError(null);
              }}
              className={`flex-1 rounded-md py-1.5 transition ${
                tab === t ? "bg-white/10 text-slate-100" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {t === "signin" ? "Sign in" : "Sign up"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3">
          {tab === "signup" && (
            <Field label="Name (optional)">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                className="input"
                placeholder="Satoshi"
              />
            </Field>
          )}
          <Field label="Email">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="input"
              placeholder="you@example.com"
            />
          </Field>
          <Field label="Password">
            <div className="relative">
              <input
                type={show ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={tab === "signup" ? "new-password" : "current-password"}
                className="input pr-14"
                placeholder={tab === "signup" ? "At least 8 characters" : "••••••••"}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-300"
              >
                {show ? "Hide" : "Show"}
              </button>
            </div>
          </Field>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="gradient-cta w-full rounded-xl py-2.5 font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "…" : tab === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-500">
          {tab === "signin" ? "New here? " : "Already have an account? "}
          <button
            onClick={() => setTab(tab === "signin" ? "signup" : "signin")}
            className="text-brand-light hover:underline"
          >
            {tab === "signin" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      {children}
    </label>
  );
}
