import type { TraderStats } from "../types";
import { shortAddr } from "../format";
import { UserIcon, ExternalIcon } from "./icons";

// Only identity is needed here, so the tier-1 summary can render this header
// before the full stats have finished computing.
type HeaderStats = Pick<TraderStats, "address" | "profile">;

export function TraderHeader({ stats }: { stats: HeaderStats }) {
  const displayName =
    stats.profile.name || stats.profile.pseudonym || shortAddr(stats.address);
  return (
    <div className="flex items-center gap-4">
      {stats.profile.profileImage ? (
        <img
          src={stats.profile.profileImage}
          alt=""
          className="h-12 w-12 rounded-full object-cover ring-1 ring-white/10"
        />
      ) : (
        <div className="grid h-12 w-12 place-items-center rounded-full bg-ink-700 text-slate-400 ring-1 ring-white/10">
          <UserIcon className="h-6 w-6" />
        </div>
      )}
      <div>
        <h2 className="text-lg font-semibold text-slate-100">{displayName}</h2>
        <a
          href={`https://polymarket.com/profile/${stats.address}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-mono text-sm text-brand-light hover:underline"
        >
          {shortAddr(stats.address)}
          <ExternalIcon className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}
