import { eq } from 'drizzle-orm'
import { users, toolDays, githubStats } from '@/db/schema'

// Loose enough to accept both the pglite-backed and node-postgres-backed
// drizzle instances src/db/client.ts can hand back, without importing that
// module into a lib file. Same rationale as src/lib/ingest.ts's Transactable.
type Database = {
  update: (...args: any[]) => any
  transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>
}

// The public-board gate is revocable in either direction: this is the only
// place that flips it, so setPublicOptIn (the server action) is a thin
// auth-checking wrapper around this.
export async function setPublicOptInForUser(database: Database, userId: number, value: boolean): Promise<void> {
  await database.update(users).set({ publicOptIn: value }).where(eq(users.id, userId))
}

// Deletion also resets publicOptIn, in the same transaction as the data
// removal: an opted-in user with their rows gone must not still read as
// listed (canAppearOnBoards would already exclude them via hasData, but the
// flag itself must not silently keep saying "yes, list me").
export async function deleteAllDataForUser(database: Database, userId: number): Promise<void> {
  await database.transaction(async (tx: any) => {
    await tx.delete(toolDays).where(eq(toolDays.userId, userId))
    await tx.delete(githubStats).where(eq(githubStats.userId, userId))
    await tx.update(users).set({ publicOptIn: false }).where(eq(users.id, userId))
  })
}
