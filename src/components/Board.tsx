import * as React from 'react'
import type { BoardEntry } from '@/lib/boards'
import { XHandleLink } from '@/components/XHandleLink'

/** A row with its value already formatted on the server. */
export type BoardRow = BoardEntry & { display: string }

export function Board({
  title,
  entries,
}: {
  title?: string
  entries: BoardRow[]
}) {
  return (
    <div>
      {title ? (
        <h2 className="mb-3 text-sm uppercase tracking-widest text-muted-foreground">{title}</h2>
      ) : null}
      <ol className="divide-y divide-border">
        {entries.slice(0, 25).map((e, i) => (
          <li key={e.handle} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-3">
            <span className="font-mono tabular-nums text-muted-foreground">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <a href={`/@${e.handle}`} className="inline-flex min-h-11 max-w-full items-center truncate hover:underline">
                @{e.handle}
              </a>
              {e.xHandle && <XHandleLink handle={e.xHandle} className="mt-0.5" />}
            </div>
            <span className="text-right font-mono tabular-nums">{e.display}</span>
            <div className="col-start-2 col-end-4 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
              <span><span className="font-mono tabular-nums">{e.toolCount}</span>{' '}{e.toolCount === 1 ? 'tool' : 'tools'}</span>
              <span title={e.verified ? 'Verified usage' : 'Includes self-reported usage'}>
                <span aria-hidden="true">{e.verified ? '✅' : '🔶'}</span>{' '}
                {e.verified ? 'Verified' : 'Self-reported'}
              </span>
            </div>
          </li>
        ))}
        {entries.length === 0 && (
          <li className="py-6 text-sm text-muted-foreground">Nobody yet. Be first.</li>
        )}
      </ol>
    </div>
  )
}
