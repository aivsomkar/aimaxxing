import type { BoardEntry } from '@/lib/boards'

export function Board({
  title,
  entries,
  format,
}: {
  title: string
  entries: BoardEntry[]
  format: (v: number) => string
}) {
  return (
    <div>
      <h2 className="mb-3 text-sm uppercase tracking-widest text-muted-foreground">{title}</h2>
      <ol className="divide-y divide-border">
        {entries.slice(0, 25).map((e, i) => (
          <li key={e.handle} className="flex items-center gap-3 py-2">
            <span className="w-8 font-mono tabular-nums text-muted-foreground">{i + 1}</span>
            <a href={`/@${e.handle}`} className="flex-1 truncate hover:underline">
              @{e.handle}
            </a>
            <span className="text-xs text-muted-foreground">{e.toolCount} tools</span>
            <span title={e.verified ? 'Verified' : 'Self-reported'}>
              {e.verified ? '✅' : '🔶'}
            </span>
            <span className="w-28 text-right font-mono tabular-nums">{format(e.value)}</span>
          </li>
        ))}
        {entries.length === 0 && (
          <li className="py-6 text-sm text-muted-foreground">Nobody yet. Be first.</li>
        )}
      </ol>
    </div>
  )
}
