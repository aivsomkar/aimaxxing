import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { eq } from 'drizzle-orm'
import * as schema from '../src/db/schema'
import {
  approveLinkSession,
  consumeApprovedLink,
  createLinkSession,
  deleteReporterData,
  getLinkStatus,
  hashReporterSecret,
  recordReporterSubmission,
  revokeReporter,
} from '../src/lib/reporter-store'

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  client = new PGlite()
  database = drizzle(client, { schema })
  await migrate(database, { migrationsFolder: 'drizzle' })
})

afterAll(async () => client.close())

describe('reporter store', () => {
  it('hashes one-time codes, approves once, consumes once, and enforces ownership', async () => {
    const [owner] = await database.insert(schema.users).values({
      githubId: 'reporter-owner', handle: 'reporter-owner',
    }).returning()
    const [other] = await database.insert(schema.users).values({
      githubId: 'reporter-other', handle: 'reporter-other',
    }).returning()
    const now = new Date('2026-08-23T00:00:00Z')
    const link = await createLinkSession(database, {
      deviceCode: 'device-secret',
      userCode: 'ABCD-EFGH',
      publicKey: 'public-key',
      publicKeyFingerprint: 'fingerprint-1',
      machineIdHash: 'machine-hash-1',
      machineLabel: 'Omkar Mac',
      expiresAt: new Date(now.getTime() + 10 * 60_000),
    })
    expect(link.deviceCodeHash).toBe(hashReporterSecret('device-secret'))
    expect(link.userCodeHash).toBe(hashReporterSecret('ABCD-EFGH'))
    expect(JSON.stringify(link)).not.toContain('device-secret')
    expect(JSON.stringify(link)).not.toContain('ABCD-EFGH')

    await expect(approveLinkSession(database, 'wrong-code', owner.id, now)).resolves.toBeNull()
    await expect(approveLinkSession(database, 'ABCD-EFGH', owner.id, now)).resolves.toMatchObject({
      userId: owner.id,
    })
    await expect(getLinkStatus(database, 'device-secret', now)).resolves.toEqual({ status: 'pending_approval_consumption' })

    const reporter = await consumeApprovedLink(database, 'device-secret', now)
    expect(reporter).toMatchObject({ userId: owner.id, machineLabel: 'Omkar Mac', revokedAt: null })
    await expect(consumeApprovedLink(database, 'device-secret', now)).resolves.toBeNull()
    await expect(getLinkStatus(database, 'device-secret', now)).resolves.toMatchObject({
      status: 'approved', reporterId: reporter?.id, handle: owner.handle,
    })

    await expect(revokeReporter(database, other.id, reporter!.id, now)).resolves.toBe(false)
    await expect(revokeReporter(database, owner.id, reporter!.id, now)).resolves.toBe(true)
  })

  it('marks expired codes and keeps submission IDs unique', async () => {
    const [owner] = await database.insert(schema.users).values({
      githubId: 'expired-owner', handle: 'expired-owner',
    }).returning()
    const now = new Date('2026-08-23T01:00:00Z')
    await createLinkSession(database, {
      deviceCode: 'expired-device',
      userCode: 'OLD-CODE',
      publicKey: 'public-key-2',
      publicKeyFingerprint: 'fingerprint-2',
      machineIdHash: 'machine-hash-2',
      machineLabel: 'Old machine',
      expiresAt: new Date(now.getTime() - 1),
    })
    await expect(getLinkStatus(database, 'expired-device', now)).resolves.toEqual({ status: 'expired' })
    await expect(approveLinkSession(database, 'OLD-CODE', owner.id, now)).resolves.toBeNull()

    const [reporter] = await database.insert(schema.reporters).values({
      userId: owner.id,
      machineIdHash: 'direct-machine',
      machineLabel: 'Direct',
      publicKey: 'direct-key',
      publicKeyFingerprint: 'direct-fingerprint',
    }).returning()
    await expect(recordReporterSubmission(database, {
      id: 'submission-1', reporterId: reporter.id, payloadHash: 'payload', pricingVersion: '2026-08-23',
    })).resolves.toBe(true)
    await expect(recordReporterSubmission(database, {
      id: 'submission-1', reporterId: reporter.id, payloadHash: 'payload', pricingVersion: '2026-08-23',
    })).resolves.toBe(false)
  })

  it('deletes verified rows for only the owned reporter', async () => {
    const [owner] = await database.insert(schema.users).values({
      githubId: 'delete-owner', handle: 'delete-owner',
    }).returning()
    const reporters = await database.insert(schema.reporters).values([
      {
        userId: owner.id, machineIdHash: 'delete-a', machineLabel: 'A',
        publicKey: 'key-a', publicKeyFingerprint: 'fp-a',
      },
      {
        userId: owner.id, machineIdHash: 'delete-b', machineLabel: 'B',
        publicKey: 'key-b', publicKeyFingerprint: 'fp-b',
      },
    ]).returning()
    await database.insert(schema.reporterToolDays).values(reporters.map((reporter, index) => ({
      reporterId: reporter.id, userId: owner.id, tool: 'codex-cli', model: `gpt-${index}`,
      day: '2026-08-23', sessions: 1,
    })))

    await expect(deleteReporterData(database, owner.id + 999, reporters[0].id)).resolves.toBe(false)
    await expect(deleteReporterData(database, owner.id, reporters[0].id)).resolves.toBe(true)
    expect(await database.select().from(schema.reporterToolDays)
      .where(eq(schema.reporterToolDays.reporterId, reporters[0].id))).toHaveLength(0)
    expect(await database.select().from(schema.reporterToolDays)
      .where(eq(schema.reporterToolDays.reporterId, reporters[1].id))).toHaveLength(1)
  })
})
