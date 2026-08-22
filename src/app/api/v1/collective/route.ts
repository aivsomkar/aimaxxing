import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getCollectiveRows } from '@/lib/queries'
import { collectiveTotals } from '@/lib/collective'
import { db } from '@/db/client'
import { users } from '@/db/schema'

// Polled every 15s by CollectiveCounter to re-anchor the interpolated ticker.
export const dynamic = 'force-dynamic'

export async function GET() {
  const all = collectiveTotals(await getCollectiveRows('all'))
  const day = collectiveTotals(await getCollectiveRows('day'))
  const devs = await db.select({ h: users.handle }).from(users).where(eq(users.publicOptIn, true))

  return NextResponse.json({
    costUsd: all.costUsd,
    tokensTotal: all.tokensTotal,
    last24hCostUsd: day.costUsd,
    developers: devs.length,
  })
}
