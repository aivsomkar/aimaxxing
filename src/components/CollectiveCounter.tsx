'use client'
import { useEffect, useRef, useState } from 'react'

type Totals = { costUsd: number; tokensTotal: number; last24hCostUsd: number; developers: number }

// The counter must never look frozen: it interpolates dollars from the 24h
// burn rate between 15s polls of /api/v1/collective, so the ticker keeps
// moving even though the underlying data only actually changes on poll.
export function CollectiveCounter({ initial }: { initial: Totals }) {
  const [t, setT] = useState(initial)
  const rate = useRef(initial.last24hCostUsd / 86400) // dollars per second
  const [drift, setDrift] = useState(0)

  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const next: Totals = await fetch('/api/v1/collective').then((r) => r.json())
        rate.current = next.last24hCostUsd / 86400
        setT(next)
        setDrift(0)
      } catch {
        // Transient fetch failure: keep ticking on the last known rate
        // rather than freezing the display.
      }
    }, 15000)
    const tick = setInterval(() => setDrift((d) => d + rate.current * 0.1), 100)
    return () => {
      clearInterval(poll)
      clearInterval(tick)
    }
  }, [])

  return (
    <section className="py-16 text-center">
      {/* Tokens lead: at launch the token count is in the billions and reads
          as enormous, while the dollar figure is small. Tokens are sized
          larger than dollars on purpose. */}
      <div className="font-mono text-4xl tracking-tight tabular-nums sm:text-6xl">
        {Math.round(t.tokensTotal).toLocaleString()}
      </div>
      <div className="mt-1 text-xs uppercase tracking-[0.3em] text-muted-foreground">
        tokens burned
      </div>

      <div className="mt-8 font-mono text-3xl tabular-nums text-primary sm:text-5xl">
        $
        {(t.costUsd + drift).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </div>
      <div className="mt-3 text-sm text-muted-foreground">
        by{' '}
        <span className="font-mono tabular-nums text-foreground">
          {t.developers.toLocaleString()}
        </span>{' '}
        developers ·{' '}
        <span className="font-mono tabular-nums text-foreground">
          ${t.last24hCostUsd.toFixed(2)}
        </span>{' '}
        in the last 24h
      </div>
    </section>
  )
}
