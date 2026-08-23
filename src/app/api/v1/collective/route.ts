import { NextResponse } from 'next/server'
import { getCollectiveSummary } from '@/lib/queries'

// Polled every 15s by CollectiveCounter for exact persisted totals.
export const dynamic = 'force-static'
export const revalidate = 15

export async function GET() {
  const summary = await getCollectiveSummary()

  return NextResponse.json({
    costUsd: summary.totals.costUsd,
    tokensTotal: summary.totals.tokensTotal,
    todayCostUsd: summary.todayTotals.costUsd,
    developers: summary.developers,
  })
}
