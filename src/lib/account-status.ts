import { count, eq } from 'drizzle-orm'
import { githubStats, portfolioProjects, toolDays, users } from '@/db/schema'

type Database = {
  select: (...args: any[]) => any
}

export type AccountStatus = {
  handle: string
  state: 'private-empty' | 'private-ready' | 'public'
  publicOptIn: boolean
  usageCount: number
  projectCount: number
  githubSyncedAt: Date | null
  canPublish: boolean
  output: {
    mergedPrs: number
    activeRepos: number
    contributions: number
  }
}

export async function getAccountStatus(
  database: Database,
  userId: number,
): Promise<AccountStatus | null> {
  const [userRows, usageRows, projectRows, outputRows] = await Promise.all([
    database.select({ handle: users.handle, publicOptIn: users.publicOptIn })
      .from(users).where(eq(users.id, userId)),
    database.select({ value: count() }).from(toolDays).where(eq(toolDays.userId, userId)),
    database.select({ value: count() }).from(portfolioProjects)
      .where(eq(portfolioProjects.userId, userId)),
    database.select({
      mergedPrs: githubStats.mergedPrs,
      activeRepos: githubStats.activeRepos,
      contributions: githubStats.contributions,
      syncedAt: githubStats.syncedAt,
    }).from(githubStats).where(eq(githubStats.userId, userId)),
  ])
  const user = userRows[0]
  if (!user) return null
  const output = outputRows[0] ?? {
    mergedPrs: 0,
    activeRepos: 0,
    contributions: 0,
    syncedAt: null,
  }
  const usageCount = Number(usageRows[0]?.value ?? 0)
  const projectCount = Number(projectRows[0]?.value ?? 0)
  const canPublish = usageCount > 0
    || projectCount > 0
    || output.mergedPrs > 0
    || output.activeRepos > 0
    || output.contributions > 0

  return {
    handle: user.handle,
    state: user.publicOptIn && canPublish
      ? 'public'
      : canPublish ? 'private-ready' : 'private-empty',
    publicOptIn: user.publicOptIn,
    usageCount,
    projectCount,
    githubSyncedAt: output.syncedAt,
    canPublish,
    output: {
      mergedPrs: output.mergedPrs,
      activeRepos: output.activeRepos,
      contributions: output.contributions,
    },
  }
}
