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

  const handles = await database.select({ handle: users.handle }).from(users)
  const handle = deriveHandle(
    identity.githubLogin ?? `dev-${identity.githubId}`,
    new Set(handles.map((row: { handle: string }) => row.handle)),
  )
  const [created] = await database.insert(users).values({
    githubId: identity.githubId,
    githubLogin: identity.githubLogin,
    handle,
    avatarUrl: identity.avatarUrl,
  }).returning()
  return created
}
