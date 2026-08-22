import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import * as schema from '../src/db/schema'
import {
  approveReporterLink,
  denyReporterLink,
  pollReporterLink,
  startReporterLink,
} from '../src/lib/reporter-link'

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>
let sequence = 0

beforeAll(async () => {
  client = new PGlite()
  database = drizzle(client, { schema })
  await migrate(database, { migrationsFolder: 'drizzle' })
})

afterAll(async () => client.close())

async function owner() {
  sequence += 1
  const [user] = await database.insert(schema.users).values({
    githubId: `link-${sequence}`, handle: `link-${sequence}`,
  }).returning()
  return user
}

const input = {
  publicKey: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA111111111111111111111111111111111111111=\n-----END PUBLIC KEY-----',
  machineId: 'random-machine-identifier-123456789',
  machineLabel: 'Omkar MacBook',
}

describe('reporter link protocol', () => {
  it('returns high-entropy one-time codes, stores only hashes, and creates one reporter', async () => {
    const user = await owner()
    const now = new Date('2026-08-23T00:00:00Z')
    const started = await startReporterLink(database, input, 'https://www.aimaxxing.lol', now)
    expect(Buffer.from(started.deviceCode, 'base64url')).toHaveLength(32)
    expect(started.userCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
    expect(started).toMatchObject({ interval: 5, expiresIn: 600 })
    expect(started.verificationUrl).toBe(`https://www.aimaxxing.lol/link?code=${started.userCode}`)

    const [stored] = await database.select().from(schema.reporterLinkSessions)
    expect(JSON.stringify(stored)).not.toContain(started.deviceCode)
    expect(JSON.stringify(stored)).not.toContain(started.userCode)
    expect(stored.publicKey).toBe(input.publicKey)

    await expect(pollReporterLink(database, started.deviceCode, now)).resolves.toEqual({ status: 'pending' })
    await expect(approveReporterLink(database, started.userCode, user.id, now)).resolves.toBe(true)
    const approved = await pollReporterLink(database, started.deviceCode, now)
    expect(approved).toMatchObject({ status: 'approved', handle: user.handle })
    await expect(pollReporterLink(database, started.deviceCode, now)).resolves.toEqual(approved)
    expect(await database.select().from(schema.reporters)).toHaveLength(1)
  })

  it('reports denied and expired links without reviving them', async () => {
    const user = await owner()
    const now = new Date('2026-08-23T02:00:00Z')
    const denied = await startReporterLink(database, input, 'https://www.aimaxxing.lol', now)
    await expect(denyReporterLink(database, denied.userCode, user.id, now)).resolves.toBe(true)
    await expect(pollReporterLink(database, denied.deviceCode, now)).resolves.toEqual({ status: 'denied' })
    await expect(approveReporterLink(database, denied.userCode, user.id, now)).resolves.toBe(false)

    const expired = await startReporterLink(database, {
      ...input, machineId: 'another-random-machine-identifier',
    }, 'https://www.aimaxxing.lol', now)
    const later = new Date(now.getTime() + 10 * 60_000 + 1)
    await expect(pollReporterLink(database, expired.deviceCode, later)).resolves.toEqual({ status: 'expired' })
    await expect(approveReporterLink(database, expired.userCode, user.id, later)).resolves.toBe(false)
  })
})
