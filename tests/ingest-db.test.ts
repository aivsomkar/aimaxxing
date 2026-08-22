// db-backed tests for src/lib/ingest.ts's writeReport. Uses an isolated,
// in-memory PGlite instance (not the app's file-backed .data/pg) so these
// tests are hermetic and leave no state behind.
import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { eq } from 'drizzle-orm'
import * as schema from '../src/db/schema'
import { writeReport, type NormalizedRow } from '../src/lib/ingest'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  client = new PGlite()
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: 'drizzle' })
})

afterAll(async () => {
  await client.close()
})

let userSeq = 0
async function makeUser() {
  userSeq += 1
  const handle = `ingest-db-test-user-${userSeq}`
  const [user] = await db.insert(schema.users).values({ githubId: handle, handle }).returning()
  return user
}

const baseRow: NormalizedRow = {
  tool: 'claude-code', model: 'opus', day: '2026-08-01',
  sessions: 1, tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 0,
  costUsd: '0.0000', source: 'manual', verified: false,
}

describe('writeReport', () => {
  // Must fail if the token columns regress to `integer`: int4 maxes out at
  // 2,147,483,647, well under values real heavy users produce in a day.
  it('persists token counts above the int4 ceiling now that the columns are bigint', async () => {
    const user = await makeUser()
    const aboveInt4 = 3_000_000_000 // > 2,147,483,647, < the 10B sanity cap
    await writeReport(db, user.id, [{ ...baseRow, tokensIn: aboveInt4 }])
    const [row] = await db.select().from(schema.toolDays).where(eq(schema.toolDays.userId, user.id))
    expect(row.tokensIn).toBe(aboveInt4)
  })

  // Must fail if the transaction wrapper is removed: without it, the first
  // (valid) row commits before the second (DB-rejected) row throws, leaving
  // a partial write instead of nothing.
  it('rolls back the whole batch when one row fails, so nothing partially commits', async () => {
    const user = await makeUser()
    const rows: NormalizedRow[] = [
      { ...baseRow, day: '2026-08-02' },      // would succeed in isolation
      { ...baseRow, day: 'not-a-real-date' },  // Postgres rejects this at insert time
    ]
    await expect(writeReport(db, user.id, rows)).rejects.toThrow()
    const after = await db.select().from(schema.toolDays).where(eq(schema.toolDays.userId, user.id))
    expect(after).toHaveLength(0)
  })
})
