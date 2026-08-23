import { eq } from 'drizzle-orm'
import { users } from '@/db/schema'
import { deriveHandle } from '@/lib/handle'

export type GitHubIdentity = {
  githubId: string
  githubLogin: string | null
  avatarUrl: string | null
}

type Database = {
  select: (...args: any[]) => any
  insert: (...args: any[]) => any
  update: (...args: any[]) => any
}

export type UserRow = typeof users.$inferSelect

export async function provisionGitHubAccount(
  database: Database,
  identity: GitHubIdentity,
): Promise<UserRow> {
  const [existing] = await database.select().from(users)
    .where(eq(users.githubId, identity.githubId))

  if (existing) {
    const [updated] = await database.update(users).set({
      githubLogin: identity.githubLogin,
      avatarUrl: identity.avatarUrl,
    }).where(eq(users.id, existing.id)).returning()
    return updated
  }

  // Deriving the handle from a snapshot of taken handles is not atomic: two
  // concurrent first-time sign-ins can derive the same handle and race the
  // insert. On a unique-index violation, re-read the taken set and derive a
  // suffixed handle instead of letting the raw driver error escape into
  // NextAuth's error page.
  const MAX_HANDLE_ATTEMPTS = 5
  let lastError: unknown
  for (let attempt = 0; attempt < MAX_HANDLE_ATTEMPTS; attempt++) {
    const handles = await database.select({ handle: users.handle }).from(users)
    const handle = deriveHandle(
      identity.githubLogin ?? `dev-${identity.githubId}`,
      new Set(handles.map((row: { handle: string }) => row.handle)),
    )
    try {
      const [created] = await database.insert(users).values({
        githubId: identity.githubId,
        githubLogin: identity.githubLogin,
        handle,
        avatarUrl: identity.avatarUrl,
      }).returning()
      return created
    } catch (error) {
      lastError = error
      if (!isUniqueViolation(error)) throw error
    }
  }
  throw lastError
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error
    && (error as { code?: unknown }).code === '23505'
}
