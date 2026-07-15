import { CrownIcon, CheckIcon } from "./icons";

const PERKS = [
  "Track up to 100 traders",
  "Smart money feed: see what top traders are buying",
  "Side by side trader comparison",
];

export function ProGate({
  title,
  desc,
  onUpgrade,
}: {
  title: string;
  desc: string;
  onUpgrade: () => void;
}) {
  return (
    <section className="animate-fadeUp grid place-items-center py-20 sm:py-28">
      <div className="glass w-full max-w-md rounded-2xl p-8 text-center">
        <span className="text-xs uppercase tracking-[0.2em] text-slate-500">Pro feature</span>
        <div className="mx-auto mt-4 grid h-11 w-11 place-items-center rounded-xl border border-white/10 text-premium">
          <CrownIcon className="h-5 w-5" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-400">{desc}</p>

        <ul className="mx-auto mt-6 max-w-xs space-y-2 text-left text-sm">
          {PERKS.map((p) => (
            <li key={p} className="flex items-start gap-2 text-slate-300">
              <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              {p}
            </li>
          ))}
        </ul>

        <button
          onClick={onUpgrade}
          className="gradient-cta mt-7 w-full rounded-xl py-3 font-semibold text-white transition hover:brightness-110"
        >
          Upgrade to Pro
        </button>
        <p className="mt-3 text-xs text-slate-500">$10 for 30 days. Pay with crypto.</p>
      </div>
    </section>
  );
}
