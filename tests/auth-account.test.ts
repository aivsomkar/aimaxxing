import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { eq } from 'drizzle-orm'
import * as schema from '../src/db/schema'
import { provisionGitHubAccount } from '../src/lib/auth-account'
import { upsertGitHubOutput } from '../src/lib/github-output'

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  client = new PGlite()
  database = drizzle(client, { schema })
  await migrate(database, { migrationsFolder: 'drizzle' })
})

afterAll(async () => {
  await client.close()
})

describe('provisionGitHubAccount', () => {
  it('creates once and retains the public handle when GitHub login changes', async () => {
    const first = await provisionGitHubAccount(database, {
      githubId: 'account-1', githubLogin: 'FirstLogin', avatarUrl: 'https://example.com/first.png',
    })
    const returning = await provisionGitHubAccount(database, {
      githubId: 'account-1', githubLogin: 'RenamedLogin', avatarUrl: 'https://example.com/new.png',
    })

    expect(returning.id).toBe(first.id)
    expect(returning.handle).toBe(first.handle)
    expect(returning.githubLogin).toBe('RenamedLogin')
    expect(returning.avatarUrl).toBe('https://example.com/new.png')
    expect(await database.select().from(schema.users)
      .where(eq(schema.users.githubId, 'account-1'))).toHaveLength(1)
  })

  it('derives a collision-safe handle for a new identity', async () => {
    const first = await provisionGitHubAccount(database, {
      githubId: 'account-2', githubLogin: 'same-name', avatarUrl: null,
    })
    const second = await provisionGitHubAccount(database, {
      githubId: 'account-3', githubLogin: 'same-name', avatarUrl: null,
    })
    expect(second.handle).not.toBe(first.handle)
  })
})

describe('upsertGitHubOutput', () => {
  it('creates and then updates exactly one output row', async () => {
    const user = await provisionGitHubAccount(database, {
      githubId: 'account-output', githubLogin: 'output-user', avatarUrl: null,
    })
    await upsertGitHubOutput(database, user.id, {
      mergedPrs: 3, activeRepos: 2, contributions: 10,
    }, new Date('2026-08-21T00:00:00Z'))
    await upsertGitHubOutput(database, user.id, {
      mergedPrs: 8, activeRepos: 4, contributions: 22,
    }, new Date('2026-08-22T00:00:00Z'))

    const rows = await database.select().from(schema.githubStats)
      .where(eq(schema.githubStats.userId, user.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ mergedPrs: 8, activeRepos: 4, contributions: 22 })
    expect(rows[0].syncedAt).toEqual(new Date('2026-08-22T00:00:00Z'))
  })
})
