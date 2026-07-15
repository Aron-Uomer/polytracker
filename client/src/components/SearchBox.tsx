import { useEffect, useRef, useState } from "react";
import { searchTraders, getRecent } from "../api";
import type { LeaderboardRow } from "../types";
import { SearchIcon, UserIcon } from "./icons";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const EXAMPLES = [
  { label: "LucasMeow", address: "0x7f3c8979d0afa00007bae4747d5347122af05613" },
  { label: "ImJustKen", address: "0x9d84ce0306f8551e02efef1680475fc0f1dc1344" },
];

export function SearchBox({
  onPick,
  loading,
}: {
  onPick: (address: string) => void;
  loading: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<LeaderboardRow[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);
  const recent = getRecent();
  const isAddr = ADDRESS_RE.test(query.trim());

  useEffect(() => {
    let cancelled = false;
    if (query.trim().length >= 2 && !isAddr) {
      searchTraders(query).then((m) => !cancelled && setMatches(m));
    } else {
      setMatches([]);
    }
    return () => {
      cancelled = true;
    };
  }, [query, isAddr]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function pick(address: string) {
    setOpen(false);
    setQuery("");
    onPick(address);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (ADDRESS_RE.test(q)) pick(q);
    else if (matches[0]) pick(matches[0].address);
  }

  const showDropdown = open && (matches.length > 0 || (query.length < 2 && (recent.length > 0)));

  return (
    <div ref={boxRef} className="relative flex-1">
      <form onSubmit={submit} className="flex gap-3">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder="Search a trader by name, or paste a 0x… address"
            spellCheck={false}
            className="w-full rounded-xl border border-white/10 bg-white/5 py-3.5 pl-11 pr-4 text-sm outline-none transition focus:border-brand focus:bg-white/[0.07]"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="gradient-cta rounded-xl px-7 py-3.5 font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {loading ? "…" : "Track"}
        </button>
      </form>

      {showDropdown && (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-ink-900 shadow-xl">
          {matches.length > 0
            ? matches.map((r) => (
                <Row
                  key={r.address}
                  img={r.profileImage}
                  title={r.name || r.pseudonym || "Anonymous"}
                  sub={`${r.address.slice(0, 8)}…`}
                  onClick={() => pick(r.address)}
                />
              ))
            : query.length < 2 && (
                <>
                  {recent.length > 0 && (
                    <Section label="Recent">
                      {recent.map((r) => (
                        <Row key={r.address} title={r.name} sub={`${r.address.slice(0, 8)}…`} onClick={() => pick(r.address)} />
                      ))}
                    </Section>
                  )}
                  <Section label="Examples">
                    {EXAMPLES.map((e) => (
                      <Row key={e.address} title={e.label} sub={`${e.address.slice(0, 8)}…`} onClick={() => pick(e.address)} />
                    ))}
                  </Section>
                </>
              )}
          {isAddr && (
            <Row title="Look up this address" sub={query} onClick={() => pick(query.trim())} />
          )}
        </div>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-white/5 py-1 last:border-0">
      <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-slate-600">{label}</div>
      {children}
    </div>
  );
}

function Row({
  img,
  title,
  sub,
  onClick,
}: {
  img?: string | null;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-white/5"
    >
      {img ? (
        <img src={img} alt="" className="h-7 w-7 rounded-full object-cover ring-1 ring-white/10" />
      ) : (
        <span className="grid h-7 w-7 place-items-center rounded-full bg-ink-700 text-slate-500">
          <UserIcon className="h-3.5 w-3.5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-slate-200">{title}</span>
        <span className="block truncate font-mono text-xs text-slate-500">{sub}</span>
      </span>
    </button>
  );
}
