import { LiveStatBar } from '@/components/LiveStatBar'
import { CollectiveCounter } from '@/components/CollectiveCounter'
import { ModelSplit } from '@/components/ModelSplit'
import { Board } from '@/components/Board'
import { PrivateProfileNotice } from '@/components/PrivateProfileNotice'
import { getCollectiveSummary, getEntrants } from '@/lib/queries'
import { loadPublicHomeData } from '@/lib/home-data'
import { rankBoard } from '@/lib/boards'
import { formatUsd } from '@/lib/format'

export const revalidate = 15

export default async function Home() {
  const { summary, entrants } = await loadPublicHomeData(
    () => getCollectiveSummary(),
    () => getEntrants('all'),
  )

  return (
    <>
      {/* The live proof comes before the leaderboard: LiveStatBar, then the
          counter, then the split, then the boards — see DESIGN.md. */}
      <LiveStatBar developers={summary.developers} tokensTotal={summary.totals.tokensTotal} costUsd={summary.totals.costUsd} />

      <main className="mx-auto max-w-4xl px-6">
        <PrivateProfileNotice />
        <CollectiveCounter
          initial={{
            costUsd: summary.totals.costUsd,
            tokensTotal: summary.totals.tokensTotal,
            last24hCostUsd: summary.dayTotals.costUsd,
            developers: summary.developers,
          }}
        />

        <ModelSplit shares={summary.modelShares} />

        <div className="grid gap-10 py-12 sm:grid-cols-2">
          <Board
            title="🔥 The Burn"
            entries={rankBoard('burn', entrants)}
            format={(v) => `$${formatUsd(v)}`}
          />
          <Board
            title="🎛 Breadth"
            entries={rankBoard('breadth', entrants)}
            format={(v) => `${v.toLocaleString()} ${v === 1 ? 'tool' : 'tools'}`}
          />
          <Board
            title="⚡ Efficiency"
            entries={rankBoard('efficiency', entrants)}
            format={(v) => `$${formatUsd(v)}/PR`}
          />
          <Board
            title="🏆 The Index"
            entries={rankBoard('index', entrants)}
            format={(v) => v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          />
        </div>
      </main>
    </>
  )
}
