'use client'

import * as React from 'react'
import { useState } from 'react'
import { Board, type BoardRow } from '@/components/Board'

export type BoardTab = {
  id: string
  title: string
  /** One line under the tabs saying what this board actually ranks by. */
  caption: string
  /** Values are formatted on the server: functions cannot cross the
   *  Server -> Client Component boundary. */
  entries: BoardRow[]
}

/**
 * One leaderboard at a time rather than four in a grid.
 *
 * All four boards are ranked on the server and shipped in the same payload, so
 * switching is instant and the page stays cacheable — no searchParam (which
 * would force dynamic rendering) and no refetch.
 *
 * The grid version showed the same handle four times in half-width cells, which
 * read as repetition rather than as four different rankings.
 */
export function BoardTabs({ tabs }: { tabs: BoardTab[] }) {
  const [activeId, setActiveId] = useState(tabs[0]?.id)
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0]
  if (!active) return null

  return (
    <section className="py-12">
      <div
        role="tablist"
        aria-label="Leaderboards"
        className="-mx-6 flex gap-1 overflow-x-auto px-6 pb-1"
      >
        {tabs.map((tab) => {
          const selected = tab.id === active.id
          return (
            <button
              key={tab.id}
              role="tab"
              type="button"
              id={`board-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`board-panel-${tab.id}`}
              onClick={() => setActiveId(tab.id)}
              className={
                selected
                  ? 'whitespace-nowrap rounded-full border border-primary bg-primary px-4 py-2 text-sm text-primary-foreground'
                  : 'whitespace-nowrap rounded-full border border-border px-4 py-2 text-sm text-muted-foreground hover:border-foreground/30 hover:text-foreground'
              }
            >
              {tab.title}
            </button>
          )
        })}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">{active.caption}</p>

      <div
        role="tabpanel"
        id={`board-panel-${active.id}`}
        aria-labelledby={`board-tab-${active.id}`}
        className="mt-2"
      >
        <Board title="" entries={active.entries} />
      </div>
    </section>
  )
}
