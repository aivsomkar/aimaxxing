import { and, asc, eq, gte, notExists, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { users, toolDays, reporterToolDays, githubStats, portfolioProjects } from '@/db/schema'
import type { BurnRow } from './collective'
import type { CollectiveTotals } from './collective'
import type { Entrant } from './boards'
import type { ToolDepth } from './index-math'
import { canAppearOnBoards, hasShowcaseContent } from './consent'

export type Window = 'day' | 'week' | 'month' | 'all'

// Callers pass the cutoff so query results stay deterministic in tests.
export function cutoffFor(window: Window, today: Date): string | null {
  if (window === 'all') return null
  const days = window === 'day' ? 0 : window === 'week' ? 6 : 29
  const d = new Date(today)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

// The single chokepoint every public query in this file routes through before
// returning a user's data. It does nothing but call canAppearOnBoards (Task 7)
// with that user's current publicOptIn and whether the rows just fetched are
// non-empty — it exists so there is exactly one place that makes this call,
// not so it can carry its own rule. A future public query MUST call this
// (or a function that calls it) rather than adding its own
// eq(users.publicOptIn, true) — that is how the consent promise gets
// silently broken by a later query someone forgets to gate.
function isPublic(u: { publicOptIn: boolean }, hasData: boolean): boolean {
  return canAppearOnBoards({ publicOptIn: u.publicOptIn, hasData })
}

// Anti-double-counting rule: a manual row whose (user, tool, model, day) also
// exists as a signed reporter row is shadowed by the verified copy and is
// excluded from EVERY aggregate below. Without this, a developer who reports
// the same real-world usage through both the manual form and a linked device
// would be counted twice in the collective counter, boards, and profiles.
// Every tool_days read in this file MUST include this condition.
const manualRowShadowedByVerified = notExists(
  db.select({ one: sql`1` }).from(reporterToolDays).where(and(
    eq(reporterToolDays.userId, toolDays.userId),
    eq(reporterToolDays.tool, toolDays.tool),
    eq(reporterToolDays.model, toolDays.model),
    eq(reporterToolDays.day, toolDays.day),
  )),
)


// Feeds the homepage collective counter. Deliberately NOT gated by consent:
// the counter is anonymous and aggregate (a total, never attributed to a
// handle), and the brief's reference implementation for this function sums
// every tool_days row unconditionally. See task-8 report for the full
// reasoning.
export async function getCollectiveRows(window: Window, today = new Date()): Promise<BurnRow[]> {
  const cutoff = cutoffFor(window, today)
  const [manualRows, verifiedRows] = await Promise.all([
    db.select().from(toolDays).where(and(
      cutoff ? gte(toolDays.day, cutoff) : undefined,
      manualRowShadowedByVerified,
    )),
    db.select().from(reporterToolDays)
      .where(cutoff ? gte(reporterToolDays.day, cutoff) : undefined),
  ])
  return [
    ...manualRows.map((r) => ({
    tool: r.tool, model: r.model, costUsd: Number(r.costUsd),
    tokensIn: r.tokensIn, tokensOut: r.tokensOut,
    cacheRead: r.cacheRead, cacheWrite: r.cacheWrite,
    sponsored: r.sponsored, verified: r.verified,
    })),
    ...verifiedRows.map((r) => ({
      tool: r.tool, model: r.model, costUsd: Number(r.costUsd),
      tokensIn: r.tokensIn, tokensOut: r.tokensOut,
      cacheRead: r.cacheRead, cacheWrite: r.cacheWrite,
      sponsored: false, verified: true,
    })),
  ]
}

export type CollectiveSummary = {
  totals: CollectiveTotals
  todayTotals: CollectiveTotals
  modelShares: { model: string; costUsd: number; share: number }[]
  developers: number
}

const aggregateSelection = {
  costUsd: sql<string>`coalesce(sum(case when ${toolDays.sponsored} = false then ${toolDays.costUsd} else 0 end), 0)`,
  tokensIn: sql<string>`coalesce(sum(case when ${toolDays.sponsored} = false then ${toolDays.tokensIn} else 0 end), 0)`,
  tokensOut: sql<string>`coalesce(sum(case when ${toolDays.sponsored} = false then ${toolDays.tokensOut} else 0 end), 0)`,
  cacheRead: sql<string>`coalesce(sum(case when ${toolDays.sponsored} = false then ${toolDays.cacheRead} else 0 end), 0)`,
  cacheWrite: sql<string>`coalesce(sum(case when ${toolDays.sponsored} = false then ${toolDays.cacheWrite} else 0 end), 0)`,
}

const reporterAggregateSelection = {
  costUsd: sql<string>`coalesce(sum(${reporterToolDays.costUsd}), 0)`,
  tokensIn: sql<string>`coalesce(sum(${reporterToolDays.tokensIn}), 0)`,
  tokensOut: sql<string>`coalesce(sum(${reporterToolDays.tokensOut}), 0)`,
  cacheRead: sql<string>`coalesce(sum(${reporterToolDays.cacheRead}), 0)`,
  cacheWrite: sql<string>`coalesce(sum(${reporterToolDays.cacheWrite}), 0)`,
}

function totalsFrom(row: Record<string, unknown> | undefined): CollectiveTotals {
  const tokensIn = Number(row?.tokensIn ?? 0)
  const tokensOut = Number(row?.tokensOut ?? 0)
  const cacheRead = Number(row?.cacheRead ?? 0)
  const cacheWrite = Number(row?.cacheWrite ?? 0)
  return {
    costUsd: Number(row?.costUsd ?? 0),
    tokensIn,
    tokensOut,
    cacheRead,
    cacheWrite,
    tokensTotal: tokensIn + tokensOut + cacheRead + cacheWrite,
  }
}

function addTotals(a: CollectiveTotals, b: CollectiveTotals): CollectiveTotals {
  return {
    costUsd: a.costUsd + b.costUsd,
    tokensIn: a.tokensIn + b.tokensIn,
    tokensOut: a.tokensOut + b.tokensOut,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    tokensTotal: a.tokensTotal + b.tokensTotal,
  }
}

export async function getCollectiveSummary(today = new Date()): Promise<CollectiveSummary> {
  const todayUtc = cutoffFor('day', today)!
  const [
    allRows, reporterAllRows, dayRows, reporterDayRows,
    modelRows, reporterModelRows, developerRows, reporterDeveloperRows,
  ] = await Promise.all([
    db.select(aggregateSelection).from(toolDays).where(manualRowShadowedByVerified),
    db.select(reporterAggregateSelection).from(reporterToolDays),
    db.select(aggregateSelection).from(toolDays).where(and(
      gte(toolDays.day, todayUtc),
      manualRowShadowedByVerified,
    )),
    db.select(reporterAggregateSelection).from(reporterToolDays)
      .where(gte(reporterToolDays.day, todayUtc)),
    db.select({
      model: toolDays.model,
      costUsd: sql<string>`coalesce(sum(${toolDays.costUsd}), 0)`,
    }).from(toolDays)
      .where(and(eq(toolDays.verified, true), eq(toolDays.sponsored, false)))
      .groupBy(toolDays.model),
    db.select({
      model: reporterToolDays.model,
      costUsd: sql<string>`coalesce(sum(${reporterToolDays.costUsd}), 0)`,
    }).from(reporterToolDays).groupBy(reporterToolDays.model),
    db.select({ userId: toolDays.userId })
      .from(toolDays)
      .innerJoin(users, eq(users.id, toolDays.userId))
      .where(eq(users.publicOptIn, true)),
    db.select({ userId: reporterToolDays.userId })
      .from(reporterToolDays)
      .innerJoin(users, eq(users.id, reporterToolDays.userId))
      .where(eq(users.publicOptIn, true)),
  ])
  const costByModel = new Map<string, number>()
  for (const row of [...modelRows, ...reporterModelRows]) {
    costByModel.set(row.model, (costByModel.get(row.model) ?? 0) + Number(row.costUsd))
  }
  const modelCosts = [...costByModel]
    .map(([model, costUsd]) => ({ model, costUsd }))
    .sort((a, b) => b.costUsd - a.costUsd || a.model.localeCompare(b.model))
  const verifiedSpend = modelCosts.reduce((total, row) => total + row.costUsd, 0)
  return {
    totals: addTotals(totalsFrom(allRows[0]), totalsFrom(reporterAllRows[0])),
    todayTotals: addTotals(totalsFrom(dayRows[0]), totalsFrom(reporterDayRows[0])),
    modelShares: verifiedSpend > 0
      ? modelCosts.map((row) => ({ ...row, share: row.costUsd / verifiedSpend }))
      : [],
    developers: new Set([...developerRows, ...reporterDeveloperRows].map((row) => row.userId)).size,
  }
}

type EntrantCandidate = Entrant & { userId: number; publicOptIn: boolean }

export async function getEntrants(window: Window, today = new Date()): Promise<Entrant[]> {
  const cutoff = cutoffFor(window, today)
  // Fetched WITHOUT a publicOptIn filter on purpose: the gate is applied once,
  // below, via isPublic()/canAppearOnBoards, rather than re-derived here in
  // SQL. A non-opted-in user's rows pass through this query in memory but are
  // filtered out before this function returns anything to its caller.
  const [manualRows, reporterRows] = await Promise.all([db.select({
    handle: users.handle, avatarUrl: users.avatarUrl, publicOptIn: users.publicOptIn,
    xHandle: users.xHandle, tagOptIn: users.tagOptIn,
    userId: users.id, tool: toolDays.tool, sessions: toolDays.sessions,
    costUsd: toolDays.costUsd, verified: toolDays.verified,
  })
    .from(users)
    .innerJoin(toolDays, eq(toolDays.userId, users.id))
    .where(and(
      cutoff ? gte(toolDays.day, cutoff) : undefined,
      manualRowShadowedByVerified,
    )),
  db.select({
    handle: users.handle, avatarUrl: users.avatarUrl, publicOptIn: users.publicOptIn,
    xHandle: users.xHandle, tagOptIn: users.tagOptIn,
    userId: users.id, tool: reporterToolDays.tool, sessions: reporterToolDays.sessions,
    costUsd: reporterToolDays.costUsd,
  })
    .from(users)
    .innerJoin(reporterToolDays, eq(reporterToolDays.userId, users.id))
    .where(cutoff ? gte(reporterToolDays.day, cutoff) : undefined)])
  const rows = [
    ...manualRows,
    ...reporterRows.map((row) => ({ ...row, verified: true })),
  ]

  const stats = await db.select().from(githubStats)
  const statFor = new Map(stats.map((s) => [s.userId, s]))

  const byUser = new Map<string, EntrantCandidate>()
  for (const r of rows) {
    let e = byUser.get(r.handle)
    if (!e) {
      const s = statFor.get(r.userId)
      e = {
        userId: r.userId, publicOptIn: r.publicOptIn,
        handle: r.handle, avatarUrl: r.avatarUrl,
        xHandle: r.tagOptIn ? r.xHandle : null,
        tools: [], costUsd: 0,
        mergedPrs: s?.mergedPrs ?? 0, contributions: s?.contributions ?? 0,
        anyUnverified: false,
      }
      byUser.set(r.handle, e)
    }
    const cost = Number(r.costUsd)
    e.costUsd += cost
    if (!r.verified) e.anyUnverified = true
    // Aggregated per tool across models and days — model is intentionally
    // absent from the grouping key.
    const t = e.tools.find((x) => x.tool === r.tool)
    if (t) { t.sessions += r.sessions; t.costUsd += cost }
    else e.tools.push({ tool: r.tool, sessions: r.sessions, costUsd: cost })
  }

  return [...byUser.values()]
    .filter((e) => isPublic({ publicOptIn: e.publicOptIn }, e.tools.length > 0))
    .map(({ userId, publicOptIn, ...entrant }) => entrant)
}

// Narrow public shape of a user row. Social consent stays outside this object:
// getProfile returns only the X handle at top level when tagOptIn is true,
// while instagramHandle, tagOptIn, and githubId never reach public callers.
export type PublicUser = {
  id: number
  handle: string
  avatarUrl: string | null
  publicOptIn: boolean
}

export type PublicPortfolioProject = {
  id: number
  source: string
  title: string
  description: string | null
  liveUrl: string
  repositoryUrl: string | null
  sortOrder: number
}

export type ProfileRecord = {
  user: PublicUser
  xHandle: string | null
  tools: ToolDepth[]
  models: { model: string; tokens: number; costUsd: number }[]
  tokenTotals: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
    total: number
  }
  costUsd: number
  mergedPrs: number
  activeRepos: number
  contributions: number
  anyUnverified: boolean
  anyVerified: boolean
  projects: PublicPortfolioProject[]
}

function profileSummary(profile: ProfileRecord) {
  return {
    usageRows: profile.tools.length,
    projects: profile.projects.length,
    mergedPrs: profile.mergedPrs,
    activeRepos: profile.activeRepos,
    contributions: profile.contributions,
  }
}

export async function getProfileRecord(handle: string): Promise<ProfileRecord | null> {
  // Handles are lowercased at creation; normalize so /@Omkar resolves the same
  // profile as /@omkar instead of 404ing a real developer.
  const normalized = handle.toLowerCase()
  const [u] = await db
    .select({
      id: users.id,
      handle: users.handle,
      avatarUrl: users.avatarUrl,
      publicOptIn: users.publicOptIn,
      xHandle: users.xHandle,
      tagOptIn: users.tagOptIn,
    })
    .from(users)
    .where(eq(users.handle, normalized))
  if (!u) return null

  const [manualRows, reporterRows, stats, projects] = await Promise.all([
    db.select().from(toolDays).where(and(
      eq(toolDays.userId, u.id),
      manualRowShadowedByVerified,
    )),
    db.select().from(reporterToolDays).where(eq(reporterToolDays.userId, u.id)),
    db.select().from(githubStats).where(eq(githubStats.userId, u.id)),
    db
      .select({
        id: portfolioProjects.id,
        source: portfolioProjects.source,
        title: portfolioProjects.title,
        description: portfolioProjects.description,
        liveUrl: portfolioProjects.liveUrl,
        repositoryUrl: portfolioProjects.repositoryUrl,
        sortOrder: portfolioProjects.sortOrder,
      })
      .from(portfolioProjects)
      .where(eq(portfolioProjects.userId, u.id))
      .orderBy(asc(portfolioProjects.sortOrder), asc(portfolioProjects.id)),
  ])
  const rows = [
    ...manualRows,
    ...reporterRows.map((row) => ({ ...row, verified: true })),
  ]
  const s = stats[0]

  const tools: ToolDepth[] = []
  const models: ProfileRecord['models'] = []
  const tokenTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
  let costUsd = 0
  let anyUnverified = false
  let anyVerified = false
  for (const r of rows) {
    const c = Number(r.costUsd)
    const tokens = r.tokensIn + r.tokensOut + r.cacheRead + r.cacheWrite
    costUsd += c
    tokenTotals.input += r.tokensIn
    tokenTotals.output += r.tokensOut
    tokenTotals.cacheRead += r.cacheRead
    tokenTotals.cacheWrite += r.cacheWrite
    tokenTotals.total += tokens
    if (!r.verified) anyUnverified = true
    if (r.verified) anyVerified = true
    const t = tools.find((x) => x.tool === r.tool)
    if (t) { t.sessions += r.sessions; t.costUsd += c }
    else tools.push({ tool: r.tool, sessions: r.sessions, costUsd: c })
    const model = models.find((entry) => entry.model === r.model)
    if (model) { model.tokens += tokens; model.costUsd += c }
    else models.push({ model: r.model, tokens, costUsd: c })
  }
  models.sort((a, b) => b.tokens - a.tokens || a.model.localeCompare(b.model))
  return {
    user: {
      id: u.id,
      handle: u.handle,
      avatarUrl: u.avatarUrl,
      publicOptIn: u.publicOptIn,
    },
    xHandle: u.tagOptIn ? u.xHandle : null,
    tools, models, tokenTotals, costUsd,
    mergedPrs: s?.mergedPrs ?? 0,
    activeRepos: s?.activeRepos ?? 0,
    contributions: s?.contributions ?? 0,
    anyUnverified, anyVerified, projects,
  }
}

export async function getPublicProfile(handle: string): Promise<ProfileRecord | null> {
  const profile = await getProfileRecord(handle)
  if (!profile?.user.publicOptIn || !hasShowcaseContent(profileSummary(profile))) return null
  return profile
}

export async function getProfileVisibility(handle: string): Promise<{ isPublic: boolean } | null> {
  const [user] = await db
    .select({ id: users.id, publicOptIn: users.publicOptIn })
    .from(users)
    .where(eq(users.handle, handle.toLowerCase()))
  if (!user) return null
  if (!user.publicOptIn) return { isPublic: false }

  const [manualRows, reporterRows, projectRows, outputRows] = await Promise.all([
    db.select({ id: toolDays.id }).from(toolDays).where(eq(toolDays.userId, user.id)).limit(1),
    db.select({ id: reporterToolDays.id }).from(reporterToolDays)
      .where(eq(reporterToolDays.userId, user.id)).limit(1),
    db.select({ id: portfolioProjects.id }).from(portfolioProjects)
      .where(eq(portfolioProjects.userId, user.id)).limit(1),
    db.select({
      mergedPrs: githubStats.mergedPrs,
      activeRepos: githubStats.activeRepos,
      contributions: githubStats.contributions,
    }).from(githubStats).where(eq(githubStats.userId, user.id)),
  ])
  const output = outputRows[0]
  return {
    isPublic: hasShowcaseContent({
      usageRows: manualRows.length + reporterRows.length,
      projects: projectRows.length,
      mergedPrs: output?.mergedPrs ?? 0,
      activeRepos: output?.activeRepos ?? 0,
      contributions: output?.contributions ?? 0,
    }),
  }
}

export async function getProfileForViewer(
  handle: string,
  viewerHandle: string | null,
): Promise<{ profile: ProfileRecord; isOwner: boolean; isPublic: boolean } | null> {
  const profile = await getProfileRecord(handle)
  if (!profile) return null
  const isOwner = viewerHandle === profile.user.handle
  const isPublicProfile = profile.user.publicOptIn && hasShowcaseContent(profileSummary(profile))
  return isOwner || isPublicProfile
    ? { profile, isOwner, isPublic: isPublicProfile }
    : null
}
