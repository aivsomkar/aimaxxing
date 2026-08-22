import * as React from 'react'
import type { BoardEntry } from '@/lib/boards'
import { XHandleLink } from '@/components/XHandleLink'

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
            <div className="min-w-0 flex-1">
              <a href={`/@${e.handle}`} className="block truncate hover:underline">
                @{e.handle}
              </a>
              {e.xHandle && <XHandleLink handle={e.xHandle} className="mt-0.5" />}
            </div>
            <span className="text-xs text-muted-foreground">
              <span className="font-mono tabular-nums">{e.toolCount}</span>{' '}
              {e.toolCount === 1 ? 'tool' : 'tools'}
            </span>
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
