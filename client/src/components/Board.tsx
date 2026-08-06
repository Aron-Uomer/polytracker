/* Board furniture. The split-flap strip is the run's one authored motion
   moment: it settles once, on load, and never again. Everything reads
   correctly with animation disabled — the tiles start visible and the
   keyframe only removes a rotation. */

export function SplitFlap({ text, className = "" }: { text: string; className?: string }) {
  // Wrap by word, never by tile. A flat character list lets flex-wrap break
  // mid-word ("REC / ORD"), which no board would ever show.
  const words = text.split(" ");
  let n = 0; // running tile index, so the settle keeps stepping across words

  return (
    <div
      role="img"
      aria-label={text}
      style={{ perspective: "700px" }}
      className={`flex flex-wrap items-start gap-x-2 gap-y-[3px] sm:gap-x-3 ${className}`}
    >
      {words.map((word, w) => (
        <span key={w} aria-hidden className="flex shrink-0 gap-[3px]">
          {[...word].map((ch) => (
            <span
              key={n}
              style={{ animationDelay: `${n++ * 36}ms` }}
              className="tile animate-settle relative grid h-7 w-[19px] place-items-center font-display text-[12px] font-bold leading-none min-[400px]:h-8 min-[400px]:w-[22px] min-[400px]:text-[13px] sm:h-11 sm:w-8 sm:text-[18px]"
            >
              {ch}
            </span>
          ))}
        </span>
      ))}
    </div>
  );
}

/* A departure-board row: lamp-lit destination on the left, the detail
   painted alongside it. No card, no icon tile, no numeral — the rule and
   the lamp carry the structure. */
export function BoardRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-x-8 gap-y-2 border-t border-board-rule py-7 sm:grid-cols-[15rem_1fr] sm:py-8">
      <h3 className="lamp-text font-display text-[13px] font-bold uppercase tracking-plate">
        {label}
      </h3>
      <p className="max-w-[68ch] text-[15px] leading-relaxed text-bone-dim">{children}</p>
    </div>
  );
}
