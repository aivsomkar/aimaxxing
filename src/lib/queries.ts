import { asc, eq, gte } from 'drizzle-orm'
import { db } from '@/db/client'
import { users, toolDays, githubStats, portfolioProjects } from '@/db/schema'
import type { BurnRow } from './collective'
import type { Entrant } from './boards'
import type { ToolDepth } from './index-math'
import { canAppearOnBoards } from './consent'

export type Window = 'day' | 'week' | 'month' | 'all'

// Callers pass the cutoff so query results stay deterministic in tests.
export function cutoffFor(window: Window, today: Date): string | null {
  if (window === 'all') return null
  const days = window === 'day' ? 1 : window === 'week' ? 7 : 30
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

// Feeds the homepage collective counter. Deliberately NOT gated by consent:
// the counter is anonymous and aggregate (a total, never attributed to a
// handle), and the brief's reference implementation for this function sums
// every tool_days row unconditionally. See task-8 report for the full
// reasoning.
export async function getCollectiveRows(window: Window, today = new Date()): Promise<BurnRow[]> {
  const cutoff = cutoffFor(window, today)
  const rows = await db.select().from(toolDays)
    .where(cutoff ? gte(toolDays.day, cutoff) : undefined)
  return rows.map((r) => ({
    tool: r.tool, model: r.model, costUsd: Number(r.costUsd),
    tokensIn: r.tokensIn, tokensOut: r.tokensOut,
    cacheRead: r.cacheRead, cacheWrite: r.cacheWrite,
    sponsored: r.sponsored, verified: r.verified,
  }))
}

type EntrantCandidate = Entrant & { userId: number; publicOptIn: boolean }

export async function getEntrants(window: Window, today = new Date()): Promise<Entrant[]> {
  const cutoff = cutoffFor(window, today)
  // Fetched WITHOUT a publicOptIn filter on purpose: the gate is applied once,
  // below, via isPublic()/canAppearOnBoards, rather than re-derived here in
  // SQL. A non-opted-in user's rows pass through this query in memory but are
  // filtered out before this function returns anything to its caller.
  const rows = await db.select({
    handle: users.handle, avatarUrl: users.avatarUrl, publicOptIn: users.publicOptIn,
    xHandle: users.xHandle, tagOptIn: users.tagOptIn,
    userId: users.id, tool: toolDays.tool, sessions: toolDays.sessions,
    costUsd: toolDays.costUsd, verified: toolDays.verified,
  })
    .from(users)
    .innerJoin(toolDays, eq(toolDays.userId, users.id))
    .where(cutoff ? gte(toolDays.day, cutoff) : undefined)

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
type PublicUser = {
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

export async function getProfile(handle: string): Promise<{
  user: PublicUser
  xHandle: string | null
  tools: ToolDepth[]
  costUsd: number
  mergedPrs: number
  contributions: number
  anyUnverified: boolean
  projects: PublicPortfolioProject[]
} | null> {
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
    .where(eq(users.handle, handle))
  if (!u) return null

  const rows = await db.select().from(toolDays).where(eq(toolDays.userId, u.id))
  // Gate before any aggregate derived from `rows` is returned: a non-opted-in
  // (or data-less) user's profile does not exist as far as any caller of this
  // function is concerned. This is a public-profile query — see the task-8
  // report for why a self-view page must not read through this function.
  if (!isPublic(u, rows.length > 0)) return null

  const [s] = await db.select().from(githubStats).where(eq(githubStats.userId, u.id))
  const projects = await db
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
    .orderBy(asc(portfolioProjects.sortOrder), asc(portfolioProjects.id))

  const tools: ToolDepth[] = []
  let costUsd = 0
  let anyUnverified = false
  for (const r of rows) {
    const c = Number(r.costUsd)
    costUsd += c
    if (!r.verified) anyUnverified = true
    const t = tools.find((x) => x.tool === r.tool)
    if (t) { t.sessions += r.sessions; t.costUsd += c }
    else tools.push({ tool: r.tool, sessions: r.sessions, costUsd: c })
  }
  return {
    user: {
      id: u.id,
      handle: u.handle,
      avatarUrl: u.avatarUrl,
      publicOptIn: u.publicOptIn,
    },
    xHandle: u.tagOptIn ? u.xHandle : null,
    tools, costUsd,
    mergedPrs: s?.mergedPrs ?? 0, contributions: s?.contributions ?? 0,
    anyUnverified, projects,
  }
}
