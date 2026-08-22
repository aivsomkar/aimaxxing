import { eq } from 'drizzle-orm'
import { LiveStatBar } from '@/components/LiveStatBar'
import { CollectiveCounter } from '@/components/CollectiveCounter'
import { ModelSplit } from '@/components/ModelSplit'
import { Board } from '@/components/Board'
import { getCollectiveRows, getEntrants } from '@/lib/queries'
import { collectiveTotals, shareByModel } from '@/lib/collective'
import { rankBoard } from '@/lib/boards'
import { db } from '@/db/client'
import { users } from '@/db/schema'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const rows = await getCollectiveRows('all')
  const dayRows = await getCollectiveRows('day')
  const all = collectiveTotals(rows)
  const day = collectiveTotals(dayRows)
  const devs = await db.select({ h: users.handle }).from(users).where(eq(users.publicOptIn, true))
  const entrants = await getEntrants('all')

  return (
    <>
      {/* The live proof comes before the leaderboard: LiveStatBar, then the
          counter, then the split, then the boards — see DESIGN.md. */}
      <LiveStatBar developers={devs.length} tokensTotal={all.tokensTotal} costUsd={all.costUsd} />

      <main className="mx-auto max-w-4xl px-6">
        <CollectiveCounter
          initial={{
            costUsd: all.costUsd,
            tokensTotal: all.tokensTotal,
            last24hCostUsd: day.costUsd,
            developers: devs.length,
          }}
        />

        <ModelSplit shares={shareByModel(rows)} />

        <div className="grid gap-10 py-12 sm:grid-cols-2">
          <Board
            title="🔥 The Burn"
            entries={rankBoard('burn', entrants)}
            format={(v) => `$${v.toFixed(2)}`}
          />
          <Board
            title="🎛 Breadth"
            entries={rankBoard('breadth', entrants)}
            format={(v) => `${v} tools`}
          />
          <Board
            title="⚡ Efficiency"
            entries={rankBoard('efficiency', entrants)}
            format={(v) => `$${v.toFixed(2)}/PR`}
          />
          <Board
            title="🏆 The Index"
            entries={rankBoard('index', entrants)}
            format={(v) => v.toFixed(1)}
          />
        </div>
      </main>
    </>
  )
}
