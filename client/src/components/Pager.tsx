import { ChevronLeft, ChevronRight } from "./icons";

/** Shared prev/next pager. Renders nothing when there's only one page. */
export function Pager({
  page,
  count,
  pageSize,
  onPage,
}: {
  page: number;
  count: number;
  pageSize: number;
  onPage: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  if (totalPages <= 1) return null;
  const start = page * pageSize;

  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <span className="text-muted">
        {start + 1}–{Math.min(start + pageSize, count)} of {count}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPage(Math.max(0, page - 1))}
          disabled={page === 0}
          className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-slate-400 transition hover:border-brand hover:text-brand-light disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="tabular-nums text-slate-400">
          Page {page + 1} / {totalPages}
        </span>
        <button
          onClick={() => onPage(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
          className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-slate-400 transition hover:border-brand hover:text-brand-light disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
