// Segment shades are opacity steps on the single --primary token rather than
// a palette of raw hues (bg-amber-400 etc.) — DESIGN.md's palette only
// defines background/foreground/card/muted/border/primary/live/destructive,
// and a raw colour is explicitly called out as a defect. Opacity steps on
// --primary keep every segment on-brand and theme-safe.
//
// Written as full literal class strings (not string-concatenated) so
// Tailwind's JIT scanner can find each one verbatim in source.
const SEGMENT_BG = ['bg-primary', 'bg-primary/75', 'bg-primary/55', 'bg-primary/35', 'bg-primary/20']
const SEGMENT_DOT = ['bg-primary', 'bg-primary/75', 'bg-primary/55', 'bg-primary/35', 'bg-primary/20']

export function ModelSplit({
  shares,
}: {
  shares: { model: string; costUsd: number; share: number }[]
}) {
  // Zero entrants at launch means zero verified rows: an empty bar reads as
  // broken, so render nothing rather than a blank track.
  if (shares.length === 0) return null

  return (
    <section className="py-8">
      <h2 className="mb-3 text-sm uppercase tracking-widest text-muted-foreground">
        Where the money went
      </h2>
      <div className="flex h-3 overflow-hidden rounded-full">
        {shares.map((s, i) => (
          <div
            key={s.model}
            style={{ width: `${s.share * 100}%` }}
            className={SEGMENT_BG[i % SEGMENT_BG.length]}
            title={`${s.model} — $${s.costUsd.toFixed(2)}`}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {shares.map((s, i) => (
          <li key={s.model} className="flex items-center gap-1.5">
            <span
              className={`inline-block h-2 w-2 rounded-full ${SEGMENT_DOT[i % SEGMENT_DOT.length]}`}
            />
            <span className="font-mono tabular-nums text-foreground">
              {(s.share * 100).toFixed(1)}%
            </span>{' '}
            {s.model}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-muted-foreground">Verified reports only.</p>
    </section>
  )
}
