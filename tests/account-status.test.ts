import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { eq } from 'drizzle-orm'
import * as schema from '../src/db/schema'
import { getAccountStatus, getAccountStatusForHandle } from '../src/lib/account-status'

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>
let sequence = 0

beforeAll(async () => {
  client = new PGlite()
  database = drizzle(client, { schema })
  await migrate(database, { migrationsFolder: 'drizzle' })
})

afterAll(async () => client.close())

async function createUser(publicOptIn = false) {
  sequence += 1
  const [user] = await database.insert(schema.users).values({
    githubId: `status-${sequence}`,
    handle: `status-${sequence}`,
    publicOptIn,
  }).returning()
  return user
}

describe('getAccountStatus', () => {
  it('loads private account status directly from an authenticated handle', async () => {
    const user = await createUser()
    await database.update(schema.users).set({ xHandle: '@handle_lookup' })
      .where(eq(schema.users.id, user.id))

    await expect(getAccountStatusForHandle(database, user.handle)).resolves.toMatchObject({
      handle: user.handle,
      xHandle: '@handle_lookup',
    })
    await expect(getAccountStatusForHandle(database, 'missing-handle')).resolves.toBeNull()
  })

  it('identifies a private empty account with missing GitHub sync', async () => {
    const user = await createUser()
    await database.update(schema.users).set({ xHandle: '@private_handle' })
      .where(eq(schema.users.id, user.id))
    await expect(getAccountStatus(database, user.id)).resolves.toMatchObject({
      handle: user.handle,
      xHandle: '@private_handle',
      state: 'private-empty',
      publicOptIn: false,
      usageCount: 0,
      projectCount: 0,
      githubSyncedAt: null,
      canPublish: false,
      output: { mergedPrs: 0, activeRepos: 0, contributions: 0 },
    })
  })

  it('identifies private-ready usage and counts rows', async () => {
    const user = await createUser()
    await database.insert(schema.toolDays).values({
      userId: user.id, tool: 'codex', model: 'gpt-5', day: '2026-08-22',
      sessions: 1, costUsd: '1.0000', source: 'manual', verified: false,
    })
    await expect(getAccountStatus(database, user.id)).resolves.toMatchObject({
      state: 'private-ready', usageCount: 1, canPublish: true,
    })
  })

  it('counts verified reporter usage and excludes revoked reporters from connected state', async () => {
    const user = await createUser()
    const reporters = await database.insert(schema.reporters).values([
      {
        userId: user.id, machineIdHash: `active-${user.id}`, machineLabel: 'Laptop',
        publicKey: 'active-key', publicKeyFingerprint: `active-fp-${user.id}`,
      },
      {
        userId: user.id, machineIdHash: `revoked-${user.id}`, machineLabel: 'Old laptop',
        publicKey: 'revoked-key', publicKeyFingerprint: `revoked-fp-${user.id}`,
        revokedAt: new Date('2026-08-22T00:00:00Z'),
      },
    ]).returning()
    await database.insert(schema.reporterToolDays).values({
      reporterId: reporters[0].id, userId: user.id, tool: 'codex-cli', model: 'gpt-5.2',
      day: '2026-08-23', sessions: 2,
    })
    await expect(getAccountStatus(database, user.id)).resolves.toMatchObject({
      state: 'private-ready', usageCount: 1, connectedReporterCount: 1,
      reporters: [
        { machineLabel: 'Laptop', usageCount: 1, revokedAt: null },
        { machineLabel: 'Old laptop', usageCount: 0, revokedAt: new Date('2026-08-22T00:00:00Z') },
      ],
    })
  })

  it('identifies selected projects as publishable without usage', async () => {
    const user = await createUser()
    await database.insert(schema.portfolioProjects).values({
      userId: user.id, source: 'manual', title: 'Site', liveUrl: 'https://site.example',
    })
    await expect(getAccountStatus(database, user.id)).resolves.toMatchObject({
      state: 'private-ready', projectCount: 1, usageCount: 0, canPublish: true,
    })
  })

  it('captures synced GitHub output and a public account state', async () => {
    const user = await createUser(true)
    const syncedAt = new Date('2026-08-22T00:00:00Z')
    await database.insert(schema.githubStats).values({
      userId: user.id, mergedPrs: 4, activeRepos: 2, contributions: 50, syncedAt,
    })
    await expect(getAccountStatus(database, user.id)).resolves.toMatchObject({
      state: 'public',
      publicOptIn: true,
      canPublish: true,
      githubSyncedAt: syncedAt,
      output: { mergedPrs: 4, activeRepos: 2, contributions: 50 },
    })
  })
})
