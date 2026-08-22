import { eq } from 'drizzle-orm'
import { users, toolDays, githubStats, portfolioImportSessions, portfolioProjects } from '@/db/schema'

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

// Deletion also resets publicOptIn and clears xHandle/instagramHandle/tagOptIn,
// in the same transaction as the data removal. Social handles and the tagging
// opt-in are PII and must go too - otherwise a user who deleted everything
// could still be tagged by the weekly board post (Task 13) using a handle
// this function was supposed to have erased. publicOptIn also cannot survive:
// an opted-in user with their rows gone must not still read as listed
// (canAppearOnBoards would already exclude them via hasData, but the flag
// itself must not silently keep saying "yes, list me").
export async function deleteAllDataForUser(database: Database, userId: number): Promise<void> {
  await database.transaction(async (tx: any) => {
    await tx.delete(portfolioImportSessions).where(eq(portfolioImportSessions.userId, userId))
    await tx.delete(portfolioProjects).where(eq(portfolioProjects.userId, userId))
    await tx.delete(toolDays).where(eq(toolDays.userId, userId))
    await tx.delete(githubStats).where(eq(githubStats.userId, userId))
    await tx.update(users)
      .set({ publicOptIn: false, xHandle: null, instagramHandle: null, tagOptIn: false })
      .where(eq(users.id, userId))
  })
}
