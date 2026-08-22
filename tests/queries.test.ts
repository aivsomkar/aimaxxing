// Integration tests for src/lib/queries.ts — runs against the real app `db`
// (see src/db/client.ts), which is a file-backed PGlite instance in this
// environment. Requires migrations to already be applied (`pnpm db:migrate`);
// unlike tests/ingest-db.test.ts's isolated in-memory PGlite fixture, this
// file resets state with a beforeEach delete rather than a fresh instance
// per suite — see the task-8 report for why the two styles were not unified.
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../src/db/client'
import {
  users,
  toolDays,
  githubStats,
  portfolioProjects,
  portfolioImportSessions,
  reporterActionRequests,
  reporterLinkSessions,
  reporterSubmissions,
  reporterToolDays,
  reporters,
} from '../src/db/schema'
import {
  cutoffFor,
  getCollectiveRows,
  getCollectiveSummary,
  getEntrants,
  getProfileForViewer,
  getProfileRecord,
  getProfileVisibility,
  getPublicProfile,
} from '../src/lib/queries'
import { collectiveTotals, shareByModel } from '../src/lib/collective'

async function reset() {
  await db.delete(portfolioImportSessions)
  await db.delete(portfolioProjects)
  await db.delete(reporterActionRequests)
  await db.delete(reporterSubmissions)
  await db.delete(reporterLinkSessions)
  await db.delete(reporterToolDays)
  await db.delete(reporters)
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

describe('getCollectiveSummary', () => {
  beforeEach(reset)

  it('matches row helpers while counting only public accounts with usage as developers', async () => {
    const [publicUser] = await db.insert(users).values({
      githubId: 'summary-public', handle: 'summary-public', publicOptIn: true,
    }).returning()
    const [privateUser] = await db.insert(users).values({
      githubId: 'summary-private', handle: 'summary-private', publicOptIn: false,
    }).returning()
    const [publicEmpty] = await db.insert(users).values({
      githubId: 'summary-empty', handle: 'summary-empty', publicOptIn: true,
    }).returning()
    await db.insert(portfolioProjects).values({
      userId: publicEmpty.id, source: 'manual', title: 'Project only', liveUrl: 'https://project-only.example',
    })
    await db.insert(toolDays).values([
      {
        userId: publicUser.id, tool: 'claude-code', model: 'opus', day: '2026-08-22',
        sessions: 20, tokensIn: 100, tokensOut: 50, cacheRead: 25, cacheWrite: 5,
        costUsd: '10.0000', source: 'reporter', verified: true,
      },
      {
        userId: privateUser.id, tool: 'codex', model: 'gpt-5', day: '2026-08-22',
        sessions: 2, tokensIn: 20, tokensOut: 10, cacheRead: 0, cacheWrite: 0,
        costUsd: '5.0000', source: 'manual', verified: false,
      },
      {
        userId: publicUser.id, tool: 'sponsored', model: 'opus', day: '2026-08-22',
        sessions: 1, tokensIn: 999, tokensOut: 999, cacheRead: 999, cacheWrite: 999,
        costUsd: '999.0000', source: 'reporter', verified: true, sponsored: true,
      },
      {
        userId: publicUser.id, tool: 'older', model: 'sonnet', day: '2026-01-01',
        sessions: 1, tokensIn: 4, tokensOut: 3, cacheRead: 2, cacheWrite: 1,
        costUsd: '2.0000', source: 'reporter', verified: true,
      },
    ])

    const now = new Date('2026-08-23T00:00:00Z')
    const summary = await getCollectiveSummary(now)
    const allRows = await getCollectiveRows('all', now)
    const dayRows = await getCollectiveRows('day', now)
    expect(summary.totals).toEqual(collectiveTotals(allRows))
    expect(summary.dayTotals).toEqual(collectiveTotals(dayRows))
    expect(summary.modelShares).toEqual(shareByModel(allRows))
    expect(summary.developers).toBe(1)
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

  it('returns an X handle only when the user enabled its visibility', async () => {
    const [visible] = await db.insert(users).values({
      githubId: '7', handle: 'social', publicOptIn: true,
      xHandle: '@social_dev', tagOptIn: true,
    }).returning()
    const [hidden] = await db.insert(users).values({
      githubId: '8', handle: 'quiet', publicOptIn: true,
      xHandle: '@private_dev', tagOptIn: false,
    }).returning()
    await db.insert(toolDays).values([
      { userId: visible.id, tool: 'codex', model: 'gpt-5', day: '2026-08-22',
        sessions: 25, costUsd: '2.0000', source: 'reporter', verified: true },
      { userId: hidden.id, tool: 'codex', model: 'gpt-5', day: '2026-08-22',
        sessions: 25, costUsd: '2.0000', source: 'reporter', verified: true },
    ])

    const entrants = await getEntrants('all')
    expect(entrants.find((entry) => entry.handle === 'social')?.xHandle).toBe('@social_dev')
    expect(entrants.find((entry) => entry.handle === 'quiet')?.xHandle).toBeNull()
  })
})

describe('profile query layers', () => {
  beforeEach(reset)

  it('reports an opted-in but empty profile as not publicly visible', async () => {
    await db.insert(users).values({
      githubId: 'visibility-empty', handle: 'visibility-empty', publicOptIn: true,
    })

    await expect(getProfileVisibility('visibility-empty')).resolves.toEqual({ isPublic: false })
  })

  it('reports a selected-project-only profile as publicly visible', async () => {
    const [user] = await db.insert(users).values({
      githubId: 'visibility-project', handle: 'visibility-project', publicOptIn: true,
    }).returning()
    await db.insert(portfolioProjects).values({
      userId: user.id, source: 'manual', title: 'Live app', liveUrl: 'https://visibility.example',
    })

    await expect(getProfileVisibility('visibility-project')).resolves.toEqual({ isPublic: true })
  })

  it('returns null for a handle that does not exist', async () => {
    expect(await getPublicProfile('nobody')).toBeNull()
  })

  it('returns null for a user who has not opted in, even though they have data', async () => {
    const [priv] = await db.insert(users)
      .values({ githubId: '1', handle: 'private', publicOptIn: false }).returning()
    await db.insert(toolDays).values({
      userId: priv.id, tool: 'claude-code', model: 'opus', day: '2026-08-21',
      sessions: 50, costUsd: '10.0000', source: 'manual', verified: false,
    })
    expect(await getPublicProfile('private')).toBeNull()
  })

  it('returns null for an opted-in user with no data', async () => {
    await db.insert(users)
      .values({ githubId: '2', handle: 'empty', publicOptIn: true }).returning()
    expect(await getPublicProfile('empty')).toBeNull()
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
    const profile = await getPublicProfile('tagshy')
    expect(Object.keys(profile!.user).sort()).toEqual(['avatarUrl', 'handle', 'id', 'publicOptIn'])
    expect(profile!.xHandle).toBeNull()
  })

  it('returns a public X handle at the profile level when its visibility is enabled', async () => {
    const [u] = await db.insert(users).values({
      githubId: 'gh-social', handle: 'social-profile', publicOptIn: true,
      xHandle: '@social_dev', tagOptIn: true,
    }).returning()
    await db.insert(toolDays).values({
      userId: u.id, tool: 'codex', model: 'gpt-5', day: '2026-08-22',
      sessions: 25, costUsd: '2.0000', source: 'reporter', verified: true,
    })

    expect((await getPublicProfile('social-profile'))!.xHandle).toBe('@social_dev')
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
    const profile = await getPublicProfile('public')
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
    const profile = await getPublicProfile('mixed')
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
    const profile = await getPublicProfile('shipped')
    expect(profile!.mergedPrs).toBe(7)
    expect(profile!.contributions).toBe(200)
  })

  it('returns only public project fields in the selected portfolio order', async () => {
    const [u] = await db.insert(users)
      .values({ githubId: '6', handle: 'builder', publicOptIn: true }).returning()
    await db.insert(toolDays).values({
      userId: u.id, tool: 'codex', model: 'gpt-5', day: '2026-08-22',
      sessions: 12, costUsd: '3.0000', source: 'reporter', verified: true,
    })
    await db.insert(portfolioProjects).values([
      {
        userId: u.id, source: 'manual', title: 'Second',
        liveUrl: 'https://second.example', sortOrder: 2,
      },
      {
        userId: u.id, source: 'github', externalId: 'repo-1', title: 'First',
        description: 'The first shipped project', liveUrl: 'https://first.example',
        repositoryUrl: 'https://github.com/builder/first', sortOrder: 1,
      },
    ])
    await db.insert(portfolioImportSessions).values({
      userId: u.id, source: 'github', stateHash: 'private-state',
      candidates: [{ title: 'Not selected', liveUrl: 'https://hidden.example' }],
      expiresAt: new Date('2026-08-23T00:00:00Z'),
    })

    const profile = await getPublicProfile('builder')

    expect(profile!.projects.map((project) => project.title)).toEqual(['First', 'Second'])
    expect(Object.keys(profile!.projects[0]).sort()).toEqual([
      'description', 'id', 'liveUrl', 'repositoryUrl', 'sortOrder', 'source', 'title',
    ])
    expect(profile!.projects[0]).toMatchObject({
      source: 'github',
      liveUrl: 'https://first.example',
      repositoryUrl: 'https://github.com/builder/first',
    })
  })

  it('allows the matching owner to preview an unlisted empty profile', async () => {
    await db.insert(users).values({
      githubId: 'owner-private', handle: 'owner-private', publicOptIn: false,
    })

    expect(await getPublicProfile('owner-private')).toBeNull()
    expect(await getProfileForViewer('owner-private', 'someone-else')).toBeNull()
    await expect(getProfileForViewer('owner-private', 'owner-private')).resolves.toMatchObject({
      isOwner: true,
      isPublic: false,
      profile: { user: { handle: 'owner-private' } },
    })
  })

  it('publishes a selected-project-only profile without adding a board entrant', async () => {
    const [user] = await db.insert(users).values({
      githubId: 'project-only', handle: 'project-only', publicOptIn: true,
    }).returning()
    await db.insert(portfolioProjects).values({
      userId: user.id,
      source: 'manual',
      title: 'Live app',
      liveUrl: 'https://live.example',
    })

    expect((await getPublicProfile('project-only'))?.projects).toHaveLength(1)
    expect(await getEntrants('all')).toHaveLength(0)
  })

  it('aggregates model costs and every token class across rows', async () => {
    const [user] = await db.insert(users).values({
      githubId: 'token-owner', handle: 'token-owner', publicOptIn: true,
    }).returning()
    await db.insert(toolDays).values([
      {
        userId: user.id, tool: 'codex', model: 'gpt-5', day: '2026-08-20',
        sessions: 2, tokensIn: 10, tokensOut: 20, cacheRead: 30, cacheWrite: 40,
        costUsd: '2.5000', source: 'manual', verified: false,
      },
      {
        userId: user.id, tool: 'codex', model: 'gpt-5', day: '2026-08-21',
        sessions: 3, tokensIn: 1, tokensOut: 2, cacheRead: 3, cacheWrite: 4,
        costUsd: '1.5000', source: 'manual', verified: false,
      },
      {
        userId: user.id, tool: 'claude-code', model: 'opus', day: '2026-08-21',
        sessions: 1, tokensIn: 5, tokensOut: 6, cacheRead: 7, cacheWrite: 8,
        costUsd: '6.0000', source: 'reporter', verified: true,
      },
    ])

    const profile = await getProfileRecord('token-owner')
    expect(profile?.models).toEqual([
      { model: 'gpt-5', tokens: 110, costUsd: 4 },
      { model: 'opus', tokens: 26, costUsd: 6 },
    ])
    expect(profile?.tokenTotals).toEqual({
      input: 16,
      output: 28,
      cacheRead: 40,
      cacheWrite: 52,
      total: 136,
    })
  })

  it('combines verified reporter snapshots with manual usage throughout public queries', async () => {
    const [user] = await db.insert(users).values({
      githubId: 'combined-owner', handle: 'combined-owner', publicOptIn: true,
    }).returning()
    const [reporter] = await db.insert(reporters).values({
      userId: user.id, machineIdHash: 'combined-machine', machineLabel: 'Laptop',
      publicKey: 'combined-key', publicKeyFingerprint: 'combined-fingerprint',
    }).returning()
    await db.insert(toolDays).values({
      userId: user.id, tool: 'manual', model: 'manual-model', day: '2026-08-23',
      sessions: 2, tokensIn: 3, tokensOut: 4, costUsd: '1.0000',
      source: 'manual', verified: false,
    })
    await db.insert(reporterToolDays).values({
      reporterId: reporter.id, userId: user.id, tool: 'codex-cli', model: 'gpt-5.2',
      day: '2026-08-23', sessions: 5, tokensIn: 10, tokensOut: 20, cacheRead: 30,
      cacheWrite: 40, costUsd: '4.0000',
    })

    const collective = await getCollectiveRows('all')
    expect(collective).toHaveLength(2)
    expect(collective.find((row) => row.tool === 'codex-cli')).toMatchObject({
      verified: true, sponsored: false, costUsd: 4,
    })
    const summary = await getCollectiveSummary(new Date('2026-08-23T12:00:00Z'))
    expect(summary.totals.costUsd).toBe(5)
    expect(summary.developers).toBe(1)

    const [entrant] = await getEntrants('all')
    expect(entrant.tools.map((tool) => tool.tool).sort()).toEqual(['codex-cli', 'manual'])
    expect(entrant.anyUnverified).toBe(true)
    expect(entrant.costUsd).toBe(5)

    const profile = await getProfileRecord(user.handle)
    expect(profile?.costUsd).toBe(5)
    expect(profile?.anyVerified).toBe(true)
    expect(profile?.anyUnverified).toBe(true)
    expect(profile?.tokenTotals.total).toBe(107)
  })
})
