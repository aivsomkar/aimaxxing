import { count, eq } from 'drizzle-orm'
import {
  githubStats,
  portfolioProjects,
  reporterToolDays,
  reporters,
  toolDays,
  users,
} from '@/db/schema'

type Database = {
  select: (...args: any[]) => any
}

export type AccountStatus = {
  handle: string
  state: 'private-empty' | 'private-ready' | 'public'
  publicOptIn: boolean
  usageCount: number
  connectedReporterCount: number
  reporters: ReporterSummary[]
  projectCount: number
  githubSyncedAt: Date | null
  canPublish: boolean
  output: {
    mergedPrs: number
    activeRepos: number
    contributions: number
  }
}

export type ReporterSummary = {
  id: string
  machineLabel: string
  fingerprintPrefix: string
  linkedAt: Date
  lastSeenAt: Date | null
  revokedAt: Date | null
  usageCount: number
}

export async function getAccountStatus(
  database: Database,
  userId: number,
): Promise<AccountStatus | null> {
  const [userRows, manualUsageRows, verifiedUsageRows, reporterRows, projectRows, outputRows] = await Promise.all([
    database.select({ handle: users.handle, publicOptIn: users.publicOptIn })
      .from(users).where(eq(users.id, userId)),
    database.select({ value: count() }).from(toolDays).where(eq(toolDays.userId, userId)),
    database.select({ reporterId: reporterToolDays.reporterId })
      .from(reporterToolDays).where(eq(reporterToolDays.userId, userId)),
    database.select({
      id: reporters.id,
      machineLabel: reporters.machineLabel,
      publicKeyFingerprint: reporters.publicKeyFingerprint,
      linkedAt: reporters.linkedAt,
      lastSeenAt: reporters.lastSeenAt,
      revokedAt: reporters.revokedAt,
    }).from(reporters).where(eq(reporters.userId, userId)),
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
  const verifiedCounts = new Map<string, number>()
  for (const row of verifiedUsageRows) {
    verifiedCounts.set(row.reporterId, (verifiedCounts.get(row.reporterId) ?? 0) + 1)
  }
  const reporterSummaries: ReporterSummary[] = reporterRows.map((reporter: any): ReporterSummary => ({
    id: reporter.id,
    machineLabel: reporter.machineLabel,
    fingerprintPrefix: reporter.publicKeyFingerprint.slice(0, 23),
    linkedAt: reporter.linkedAt,
    lastSeenAt: reporter.lastSeenAt,
    revokedAt: reporter.revokedAt,
    usageCount: verifiedCounts.get(reporter.id) ?? 0,
  })).sort((a: ReporterSummary, b: ReporterSummary) => (
    a.linkedAt.getTime() - b.linkedAt.getTime() || a.id.localeCompare(b.id)
  ))
  const usageCount = Number(manualUsageRows[0]?.value ?? 0) + verifiedUsageRows.length
  const connectedReporterCount = reporterSummaries.filter((reporter) => !reporter.revokedAt).length
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
    connectedReporterCount,
    reporters: reporterSummaries,
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
