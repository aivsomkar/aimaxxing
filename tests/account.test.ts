// db-backed tests for src/lib/account.ts's setPublicOptInForUser and
// deleteAllDataForUser - the tested core behind the /settings server actions
// (setPublicOptIn, deleteAllData), which are themselves not unit-tested here
// since they require next-auth's auth() and Next's request-scoped session
// machinery. Uses an isolated, in-memory PGlite instance, same pattern as
// tests/ingest-db.test.ts.
import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { eq } from 'drizzle-orm'
import * as schema from '../src/db/schema'
import { setPublicOptInForUser, deleteAllDataForUser } from '../src/lib/account'

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
  const handle = `account-test-user-${userSeq}`
  const [user] = await db.insert(schema.users).values({ githubId: handle, handle }).returning()
  return user
}

describe('setPublicOptInForUser', () => {
  it('flips publicOptIn to true', async () => {
    const user = await makeUser()
    await setPublicOptInForUser(db, user.id, true)
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id))
    expect(row.publicOptIn).toBe(true)
  })

  it('is revocable: flipping back to false unlists the user again', async () => {
    const user = await makeUser()
    await setPublicOptInForUser(db, user.id, true)
    await setPublicOptInForUser(db, user.id, false)
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id))
    expect(row.publicOptIn).toBe(false)
  })
})

describe('deleteAllDataForUser', () => {
  it('removes all tool_days rows for the user', async () => {
    const user = await makeUser()
    await db.insert(schema.toolDays).values({
      userId: user.id, tool: 'claude-code', model: 'opus', day: '2026-08-01',
      sessions: 1, source: 'manual', costUsd: '1.0000',
    })
    await deleteAllDataForUser(db, user.id)
    const rows = await db.select().from(schema.toolDays).where(eq(schema.toolDays.userId, user.id))
    expect(rows).toHaveLength(0)
  })

  it('removes the github_stats row for the user', async () => {
    const user = await makeUser()
    await db.insert(schema.githubStats).values({ userId: user.id, mergedPrs: 5 })
    await deleteAllDataForUser(db, user.id)
    const rows = await db.select().from(schema.githubStats).where(eq(schema.githubStats.userId, user.id))
    expect(rows).toHaveLength(0)
  })

  // The mutation this guards against: deleting data but leaving publicOptIn
  // true, which would (absent canAppearOnBoards's hasData check) read as
  // "still consenting to be listed" even though there is nothing to list.
  it('resets publicOptIn to false, even if it was true', async () => {
    const user = await makeUser()
    await setPublicOptInForUser(db, user.id, true)
    await deleteAllDataForUser(db, user.id)
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id))
    expect(row.publicOptIn).toBe(false)
  })

  it('does not touch another user\'s rows', async () => {
    const target = await makeUser()
    const other = await makeUser()
    await db.insert(schema.toolDays).values({
      userId: other.id, tool: 'claude-code', model: 'opus', day: '2026-08-01',
      sessions: 1, source: 'manual', costUsd: '1.0000',
    })
    await deleteAllDataForUser(db, target.id)
    const rows = await db.select().from(schema.toolDays).where(eq(schema.toolDays.userId, other.id))
    expect(rows).toHaveLength(1)
  })
})
