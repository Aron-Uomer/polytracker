interface Props {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}

export function StatCard({ label, value, sub, valueClass }: Props) {
  return (
    <div className="glass glass-hover rounded-2xl p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className={`mt-2 font-mono text-[26px] font-semibold leading-tight tracking-tight ${valueClass ?? "text-slate-100"}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
