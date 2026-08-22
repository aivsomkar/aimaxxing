import Link from 'next/link'
import { auth } from '@/auth'
import { LiveStatBar } from '@/components/LiveStatBar'
import { CollectiveCounter } from '@/components/CollectiveCounter'
import { ModelSplit } from '@/components/ModelSplit'
import { Board } from '@/components/Board'
import { getCollectiveSummary, getEntrants, getProfileForViewer } from '@/lib/queries'
import { rankBoard } from '@/lib/boards'
import { formatUsd } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const session = await auth()
  const viewerHandle = (session?.user as { handle?: string } | undefined)?.handle ?? null
  const viewerProfile = viewerHandle
    ? await getProfileForViewer(viewerHandle, viewerHandle)
    : null
  const summary = await getCollectiveSummary()
  const entrants = await getEntrants('all')

  return (
    <>
      {/* The live proof comes before the leaderboard: LiveStatBar, then the
          counter, then the split, then the boards — see DESIGN.md. */}
      <LiveStatBar developers={summary.developers} tokensTotal={summary.totals.tokensTotal} costUsd={summary.totals.costUsd} />

      <main className="mx-auto max-w-4xl px-6">
        {viewerHandle && !viewerProfile?.isPublic && (
          <div className="mt-6 flex flex-col justify-between gap-3 border border-primary/30 bg-primary/10 px-4 py-3 text-sm sm:flex-row sm:items-center">
            <span>Your profile is private. Finish setup, preview your card, and publish when it is ready.</span>
            <Link className="inline-flex min-h-11 shrink-0 items-center font-semibold text-primary underline underline-offset-4" href="/settings">
              Open dashboard
            </Link>
          </div>
        )}
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
