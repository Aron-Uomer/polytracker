import { useState } from "react";
import type { AddWatchResult } from "../types";
import { PlusIcon, CheckIcon } from "./icons";

interface Props {
  address: string;
  tracked: boolean;
  onAdd: (address: string) => Promise<AddWatchResult>;
  onNeedUpgrade: () => void;
  compact?: boolean;
}

export function TrackButton({ address, tracked, onAdd, onNeedUpgrade, compact }: Props) {
  const [busy, setBusy] = useState(false);
  const size = compact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-xs";

  async function add(e: React.MouseEvent) {
    e.stopPropagation();
    setBusy(true);
    const res = await onAdd(address);
    setBusy(false);
    if (!res.ok && res.upgradeRequired) onNeedUpgrade();
  }

  if (tracked) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-lg border border-success/40 bg-success/10 text-success ${size}`}
      >
        <CheckIcon className="h-3.5 w-3.5" /> Tracking
      </span>
    );
  }

  return (
    <button
      onClick={add}
      disabled={busy}
      className={`inline-flex items-center gap-1 rounded-lg border border-white/10 text-slate-300 transition hover:border-brand hover:text-brand-light disabled:opacity-50 ${size}`}
    >
      <PlusIcon className="h-3.5 w-3.5" /> {busy ? "…" : "Track"}
    </button>
  );
}
