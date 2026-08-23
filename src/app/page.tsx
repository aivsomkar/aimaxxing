import { LiveStatBar } from '@/components/LiveStatBar'
import { CollectiveCounter } from '@/components/CollectiveCounter'
import { ModelSplit } from '@/components/ModelSplit'
import { BoardTabs } from '@/components/BoardTabs'
import { PrivateProfileNotice } from '@/components/PrivateProfileNotice'
import { getCollectiveSummary, getEntrants } from '@/lib/queries'
import { loadPublicHomeData } from '@/lib/home-data'
import { rankBoard } from '@/lib/boards'
import { formatUsd, formatCount, formatScore } from '@/lib/format'

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
            todayCostUsd: summary.todayTotals.costUsd,
            developers: summary.developers,
          }}
        />

        <ModelSplit shares={summary.modelShares} />

        <BoardTabs
          tabs={[
            {
              id: 'burn',
              title: '🔥 API Value',
              caption: 'Ranked by the estimated API-equivalent value of the tokens each developer used.',
              entries: rankBoard('burn', entrants).map((e) => ({ ...e, display: `$${formatUsd(e.value)}` })),
            },
            {
              id: 'breadth',
              title: '🎛 Breadth',
              caption: 'Ranked by how many tools a developer genuinely uses — a tool counts only past the qualifying floor.',
              entries: rankBoard('breadth', entrants).map((e) => ({ ...e, display: `${formatCount(e.value)} ${e.value === 1 ? 'tool' : 'tools'}` })),
            },
            {
              id: 'efficiency',
              title: '⚡ Efficiency',
              caption: 'Estimated API value per merged PR. Lower is better, and developers with no merged PRs are not ranked.',
              entries: rankBoard('efficiency', entrants).map((e) => ({ ...e, display: `$${formatUsd(e.value)}/PR` })),
            },
            {
              id: 'index',
              title: '🏆 The Index',
              caption: 'Σ √(sessions per tool) across qualifying tools, plus a capped output term. Spend never enters it.',
              entries: rankBoard('index', entrants).map((e) => ({ ...e, display: formatScore(e.value) })),
            },
          ]}
        />
      </main>
    </>
  )
}
