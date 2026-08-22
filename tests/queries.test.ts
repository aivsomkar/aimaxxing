// Integration tests for src/lib/queries.ts — runs against the real app `db`
// (see src/db/client.ts), which is a file-backed PGlite instance in this
// environment. Requires migrations to already be applied (`pnpm db:migrate`);
// unlike tests/ingest-db.test.ts's isolated in-memory PGlite fixture, this
// file resets state with a beforeEach delete rather than a fresh instance
// per suite — see the task-8 report for why the two styles were not unified.
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../src/db/client'
import { users, toolDays, githubStats } from '../src/db/schema'
import { cutoffFor, getCollectiveRows, getEntrants, getProfile } from '../src/lib/queries'

async function reset() {
  await db.delete(toolDays)
  await db.delete(githubStats)
  await db.delete(users)
}

describe('cutoffFor', () => {
  const today = new Date('2026-01-10T00:00:00Z')

  it("returns null for 'all', so no floor is applied", () => {
    expect(cutoffFor('all', today)).toBeNull()
  })

  it("returns yesterday for 'day'", () => {
    expect(cutoffFor('day', today)).toBe('2026-01-09')
  })

  it("returns 7 days back for 'week'", () => {
    expect(cutoffFor('week', today)).toBe('2026-01-03')
  })

  it("returns 30 days back for 'month', crossing a month/year boundary", () => {
    expect(cutoffFor('month', today)).toBe('2025-12-11')
  })
})

describe('getCollectiveRows', () => {
  beforeEach(reset)

  it('includes rows from users who have not opted in, because the counter is anonymous and collective', async () => {
    const [priv] = await db.insert(users)
      .values({ githubId: '1', handle: 'private', publicOptIn: false }).returning()
    await db.insert(toolDays).values({
      userId: priv.id, tool: 'claude-code', model: 'opus', day: '2026-08-21',
      sessions: 50, costUsd: '10.0000', source: 'manual', verified: false,
    })
    const rows = await getCollectiveRows('all')
    expect(rows).toHaveLength(1)
    expect(rows[0].tool).toBe('claude-code')
  })

  it('converts numeric costUsd to a number and passes bigint token columns through as numbers', async () => {
    const [u] = await db.insert(users)
      .values({ githubId: '2', handle: 'pub', publicOptIn: true }).returning()
    await db.insert(toolDays).values({
      userId: u.id, tool: 'claude-code', model: 'opus', day: '2026-08-21',
      sessions: 1, tokensIn: 3_000_000_000, costUsd: '12.5000',
      source: 'reporter', verified: true,
    })
    const [row] = await getCollectiveRows('all')
    expect(row.costUsd).toBe(12.5)
    expect(typeof row.costUsd).toBe('number')
    expect(row.tokensIn).toBe(3_000_000_000)
  })

  it('excludes rows older than the window cutoff and includes rows on/after it', async () => {
    const [u] = await db.insert(users)
      .values({ githubId: '3', handle: 'windowed', publicOptIn: true }).returning()
    await db.insert(toolDays).values([
      { userId: u.id, tool: 'in-window', model: 'm', day: '2026-08-21',
        sessions: 1, costUsd: '1.0000', source: 'reporter', verified: true },
      { userId: u.id, tool: 'out-of-window', model: 'm', day: '2026-08-01',
        sessions: 1, costUsd: '1.0000', source: 'reporter', verified: true },
    ])
    const rows = await getCollectiveRows('day', new Date('2026-08-22T00:00:00Z'))
    expect(rows.map((r) => r.tool)).toEqual(['in-window'])
  })

  // Per-purpose filtering (sponsored credits excluded from the headline
  // number, unverified excluded from the by-model/by-tool split) lives
  // downstream in collective.ts's spendable()/groupShare() — see task-8
  // report. This query itself must hand every row through untouched,
  // flags intact, so that composition keeps working. Guards against a
  // future filter creeping into this function on either flag alone.
  it('returns sponsored and unverified rows unfiltered, flags intact', async () => {
    const [u] = await db.insert(users)
      .values({ githubId: '4', handle: 'mix', publicOptIn: true }).returning()
    await db.insert(toolDays).values([
      { userId: u.id, tool: 'a', model: 'm', day: '2026-08-20',
        sessions: 1, costUsd: '1.0000', source: 'reporter', verified: true, sponsored: false },
      { userId: u.id, tool: 'b', model: 'm', day: '2026-08-20',
        sessions: 1, costUsd: '1.0000', source: 'reporter', verified: true, sponsored: true },
      { userId: u.id, tool: 'c', model: 'm', day: '2026-08-20',
        sessions: 1, costUsd: '1.0000', source: 'manual', verified: false, sponsored: false },
      { userId: u.id, tool: 'd', model: 'm', day: '2026-08-20',
        sessions: 1, costUsd: '1.0000', source: 'manual', verified: false, sponsored: true },
    ])
    const rows = await getCollectiveRows('all')
    expect(rows).toHaveLength(4)
    expect(rows.some((r) => r.sponsored)).toBe(true)
    expect(rows.some((r) => !r.sponsored)).toBe(true)
    expect(rows.some((r) => r.verified)).toBe(true)
    expect(rows.some((r) => !r.verified)).toBe(true)
  })
})

describe('getEntrants', () => {
  beforeEach(reset)

  it('omits users who have not opted in', async () => {
    const [priv] = await db.insert(users)
      .values({ githubId: '1', handle: 'private', publicOptIn: false }).returning()
    await db.insert(toolDays).values({
      userId: priv.id, tool: 'claude-code', model: 'opus', day: '2026-08-21',
      sessions: 50, costUsd: '10.0000', source: 'manual', verified: false,
    })
    expect(await getEntrants('all')).toHaveLength(0)
  })

  it('includes opted-in users and aggregates their tools', async () => {
    const [pub] = await db.insert(users)
      .values({ githubId: '2', handle: 'public', publicOptIn: true }).returning()
    await db.insert(toolDays).values([
      { userId: pub.id, tool: 'claude-code', model: 'opus', day: '2026-08-20',
        sessions: 30, costUsd: '10.0000', source: 'reporter', verified: true },
      { userId: pub.id, tool: 'claude-code', model: 'sonnet', day: '2026-08-21',
        sessions: 20, costUsd: '5.0000', source: 'reporter', verified: true },
    ])
    const [e] = await getEntrants('all')
    expect(e.handle).toBe('public')
    expect(e.tools).toHaveLength(1)          // both rows are the same tool
    expect(e.tools[0].sessions).toBe(50)
    expect(e.costUsd).toBeCloseTo(15, 5)
    expect(e.anyUnverified).toBe(false)
  })

  it('flags an entrant as unverified when any row is self-reported', async () => {
    const [u] = await db.insert(users)
      .values({ githubId: '3', handle: 'mixed', publicOptIn: true }).returning()
    await db.insert(toolDays).values([
      { userId: u.id, tool: 'a', model: 'm', day: '2026-08-20',
        sessions: 30, costUsd: '1.0000', source: 'reporter', verified: true },
      { userId: u.id, tool: 'b', model: 'm', day: '2026-08-20',
        sessions: 30, costUsd: '1.0000', source: 'manual', verified: false },
    ])
    const [e] = await getEntrants('all')
    expect(e.anyUnverified).toBe(true)
  })

  it('excludes an opted-in user who has no rows in the requested window', async () => {
    const [u] = await db.insert(users)
      .values({ githubId: '4', handle: 'stale', publicOptIn: true }).returning()
    await db.insert(toolDays).values({
      userId: u.id, tool: 'claude-code', model: 'opus', day: '2026-08-01',
      sessions: 10, costUsd: '1.0000', source: 'reporter', verified: true,
    })
    // 'day' window relative to 2026-08-22 only reaches back to 2026-08-21.
    expect(await getEntrants('day', new Date('2026-08-22T00:00:00Z'))).toHaveLength(0)
  })

  it('pulls mergedPrs and contributions from github_stats, defaulting to 0 when absent', async () => {
    const [withStats] = await db.insert(users)
      .values({ githubId: '5', handle: 'shipped', publicOptIn: true }).returning()
    const [noStats] = await db.insert(users)
      .values({ githubId: '6', handle: 'unshipped', publicOptIn: true }).returning()
    await db.insert(githubStats).values({ userId: withStats.id, mergedPrs: 4, contributions: 100 })
    await db.insert(toolDays).values([
      { userId: withStats.id, tool: 'a', model: 'm', day: '2026-08-20',
        sessions: 30, costUsd: '1.0000', source: 'reporter', verified: true },
      { userId: noStats.id, tool: 'a', model: 'm', day: '2026-08-20',
        sessions: 30, costUsd: '1.0000', source: 'reporter', verified: true },
    ])
    const entrants = await getEntrants('all')
    const shipped = entrants.find((e) => e.handle === 'shipped')!
    const unshipped = entrants.find((e) => e.handle === 'unshipped')!
    expect(shipped.mergedPrs).toBe(4)
    expect(shipped.contributions).toBe(100)
    expect(unshipped.mergedPrs).toBe(0)
    expect(unshipped.contributions).toBe(0)
  })
})

describe('getProfile', () => {
  beforeEach(reset)

  it('returns null for a handle that does not exist', async () => {
    expect(await getProfile('nobody')).toBeNull()
  })

  it('returns null for a user who has not opted in, even though they have data', async () => {
    const [priv] = await db.insert(users)
      .values({ githubId: '1', handle: 'private', publicOptIn: false }).returning()
    await db.insert(toolDays).values({
      userId: priv.id, tool: 'claude-code', model: 'opus', day: '2026-08-21',
      sessions: 50, costUsd: '10.0000', source: 'manual', verified: false,
    })
    expect(await getProfile('private')).toBeNull()
  })

  it('returns null for an opted-in user with no data', async () => {
    await db.insert(users)
      .values({ githubId: '2', handle: 'empty', publicOptIn: true }).returning()
    expect(await getProfile('empty')).toBeNull()
  })

  // xHandle/instagramHandle/tagOptIn are gated by tagOptIn, a DIFFERENT
  // consent flag from publicOptIn — the one this file's isPublic() checks.
  // A user can opt into the leaderboard (publicOptIn) while declining
  // tagging (tagOptIn). profile.user must not carry those fields (or the
  // internal githubId) regardless, so a public-profile page can't reach
  // for them even by accident.
  it("does not expose tagOptIn-gated PII (xHandle, instagramHandle, tagOptIn) or githubId on profile.user", async () => {
    const [u] = await db.insert(users).values({
      githubId: 'gh-secret', handle: 'tagshy', publicOptIn: true,
      xHandle: '@should-not-leak', instagramHandle: 'should-not-leak', tagOptIn: false,
    }).returning()
    await db.insert(toolDays).values({
      userId: u.id, tool: 'a', model: 'm', day: '2026-08-20',
      sessions: 1, costUsd: '1.0000', source: 'reporter', verified: true,
    })
    const profile = await getProfile('tagshy')
    expect(Object.keys(profile!.user).sort()).toEqual(['avatarUrl', 'handle', 'id', 'publicOptIn'])
  })

  it('returns the profile for an opted-in user, aggregating tools per tool across models and days', async () => {
    const [pub] = await db.insert(users)
      .values({ githubId: '3', handle: 'public', publicOptIn: true }).returning()
    await db.insert(toolDays).values([
      { userId: pub.id, tool: 'claude-code', model: 'opus', day: '2026-08-20',
        sessions: 30, costUsd: '10.0000', source: 'reporter', verified: true },
      { userId: pub.id, tool: 'claude-code', model: 'sonnet', day: '2026-08-21',
        sessions: 20, costUsd: '5.0000', source: 'reporter', verified: true },
    ])
    const profile = await getProfile('public')
    expect(profile).not.toBeNull()
    expect(profile!.user.handle).toBe('public')
    expect(profile!.tools).toHaveLength(1)
    expect(profile!.tools[0].sessions).toBe(50)
    expect(profile!.costUsd).toBeCloseTo(15, 5)
    expect(profile!.anyUnverified).toBe(false)
  })

  it('flags anyUnverified when any row is self-reported', async () => {
    const [u] = await db.insert(users)
      .values({ githubId: '4', handle: 'mixed', publicOptIn: true }).returning()
    await db.insert(toolDays).values([
      { userId: u.id, tool: 'a', model: 'm', day: '2026-08-20',
        sessions: 30, costUsd: '1.0000', source: 'reporter', verified: true },
      { userId: u.id, tool: 'b', model: 'm', day: '2026-08-20',
        sessions: 30, costUsd: '1.0000', source: 'manual', verified: false },
    ])
    const profile = await getProfile('mixed')
    expect(profile!.anyUnverified).toBe(true)
  })

  it('pulls mergedPrs and contributions from github_stats, defaulting to 0 when absent', async () => {
    const [u] = await db.insert(users)
      .values({ githubId: '5', handle: 'shipped', publicOptIn: true }).returning()
    await db.insert(githubStats).values({ userId: u.id, mergedPrs: 7, contributions: 200 })
    await db.insert(toolDays).values({
      userId: u.id, tool: 'a', model: 'm', day: '2026-08-20',
      sessions: 30, costUsd: '1.0000', source: 'reporter', verified: true,
    })
    const profile = await getProfile('shipped')
    expect(profile!.mergedPrs).toBe(7)
    expect(profile!.contributions).toBe(200)
  })
})
