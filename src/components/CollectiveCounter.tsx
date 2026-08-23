'use client'
import { useEffect, useState } from 'react'
import { formatUsd } from '@/lib/format'

type Totals = { costUsd: number; tokensTotal: number; todayCostUsd: number; developers: number }

export function CollectiveCounter({ initial }: { initial: Totals }) {
  const [t, setT] = useState(initial)

  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const next: Totals = await fetch('/api/v1/collective').then((r) => r.json())
        setT(next)
      } catch {
        // Keep the last exact persisted value after a transient fetch failure.
      }
    }, 15000)
    return () => clearInterval(poll)
  }, [])

  return (
    <section className="py-16 text-center" aria-labelledby="collective-counter-heading">
      {/* Tokens lead: at launch the token count is in the billions and reads
          as enormous, while the dollar figure is small. Tokens are sized
          larger than dollars on purpose. */}
      <div className="font-mono text-4xl tracking-tight tabular-nums sm:text-6xl" aria-live="off">
        {Math.round(t.tokensTotal).toLocaleString()}
      </div>
      <h1 id="collective-counter-heading" className="mt-1 text-xs uppercase tracking-[0.3em] text-muted-foreground">
        tokens burned
      </h1>

      <div className="mt-8 font-mono text-3xl tabular-nums text-primary sm:text-5xl" aria-live="off">
        ${formatUsd(t.costUsd)}
      </div>
      <div className="mt-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
        estimated API-equivalent value
      </div>
      <div className="mt-3 text-sm text-muted-foreground">
        by{' '}
        <span className="font-mono tabular-nums text-foreground">
          {t.developers.toLocaleString()}
        </span>{' '}
        developers ·{' '}
        <span className="font-mono tabular-nums text-foreground">
          ${formatUsd(t.todayCostUsd)}
        </span>{' '}
        today UTC
      </div>
    </section>
  )
}
