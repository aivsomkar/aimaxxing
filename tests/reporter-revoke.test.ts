import { generateKeyPairSync, sign } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { eq } from 'drizzle-orm'
import * as schema from '../src/db/schema'
import { canonicalActionBytes } from '../packages/reporter/src/crypto'
import {
  applySignedReporterRevocation,
  canonicalReporterActionBytes,
  revokeOwnedReporter,
  type UnsignedReporterAction,
} from '../src/lib/reporter-revoke'

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  client = new PGlite()
  database = drizzle(client, { schema })
  await migrate(database, { migrationsFolder: 'drizzle' })
})
afterAll(async () => client.close())

function pair() {
  const keys = generateKeyPairSync('ed25519')
  return {
    publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKey: keys.privateKey,
  }
}

function signed(privateKey: ReturnType<typeof pair>['privateKey'], action: UnsignedReporterAction) {
  return {
    ...action,
    signature: sign(null, canonicalReporterActionBytes(action), privateKey).toString('base64'),
  }
}

describe('reporter revocation', () => {
  it('uses the same canonical action bytes as the packaged CLI', () => {
    const action: UnsignedReporterAction = {
      reporterId: 'b10a30c0-1eb4-4f5b-87ae-12bd3a7848f3',
      action: 'revoke', issuedAt: '2026-08-23T10:00:00.000Z',
      requestId: 'canonical-revoke-1', deleteData: true,
    }
    expect(canonicalReporterActionBytes(action)).toEqual(canonicalActionBytes(action))
  })

  it('accepts a fresh self-signature once and deletes only that reporter data', async () => {
    const [user] = await database.insert(schema.users).values({
      githubId: 'revoke-self', handle: 'revoke-self',
    }).returning()
    const a = pair()
    const b = pair()
    const [reporterA, reporterB] = await database.insert(schema.reporters).values([
      { userId: user.id, machineIdHash: 'revoke-a', machineLabel: 'A', publicKey: a.publicKey, publicKeyFingerprint: 'revoke-a-fp' },
      { userId: user.id, machineIdHash: 'revoke-b', machineLabel: 'B', publicKey: b.publicKey, publicKeyFingerprint: 'revoke-b-fp' },
    ]).returning()
    await database.insert(schema.reporterToolDays).values([
      { reporterId: reporterA.id, userId: user.id, tool: 'codex-cli', model: 'a', day: '2026-08-23' },
      { reporterId: reporterB.id, userId: user.id, tool: 'codex-cli', model: 'b', day: '2026-08-23' },
    ])
    const action: UnsignedReporterAction = {
      reporterId: reporterA.id, action: 'revoke', requestId: 'revoke-request-1',
      issuedAt: '2026-08-23T10:00:00.000Z', deleteData: true,
    }
    await expect(applySignedReporterRevocation(
      database, reporterA.id, signed(a.privateKey, action), new Date('2026-08-23T10:00:00Z'),
    )).resolves.toEqual({ deletedData: true })
    expect(await database.select().from(schema.reporterToolDays)
      .where(eq(schema.reporterToolDays.reporterId, reporterA.id))).toHaveLength(0)
    expect(await database.select().from(schema.reporterToolDays)
      .where(eq(schema.reporterToolDays.reporterId, reporterB.id))).toHaveLength(1)
    await expect(applySignedReporterRevocation(
      database, reporterA.id, signed(a.privateKey, action), new Date('2026-08-23T10:00:01Z'),
    )).rejects.toMatchObject({ code: 'replayed_request' })
  })

  it('rejects stale, altered, wrong-key, and mismatched-reporter requests', async () => {
    const [user] = await database.insert(schema.users).values({
      githubId: 'revoke-invalid', handle: 'revoke-invalid',
    }).returning()
    const registered = pair()
    const attacker = pair()
    const [reporter] = await database.insert(schema.reporters).values({
      userId: user.id, machineIdHash: 'revoke-invalid', machineLabel: 'Invalid',
      publicKey: registered.publicKey, publicKeyFingerprint: 'revoke-invalid-fp',
    }).returning()
    const action: UnsignedReporterAction = {
      reporterId: reporter.id, action: 'revoke', requestId: 'revoke-invalid-1',
      issuedAt: '2026-08-23T10:00:00.000Z', deleteData: false,
    }
    await expect(applySignedReporterRevocation(
      database, reporter.id, signed(attacker.privateKey, action), new Date('2026-08-23T10:00:00Z'),
    )).rejects.toMatchObject({ code: 'invalid_signature' })
    await expect(applySignedReporterRevocation(
      database, reporter.id, { ...signed(registered.privateKey, action), deleteData: true },
      new Date('2026-08-23T10:00:00Z'),
    )).rejects.toMatchObject({ code: 'invalid_signature' })
    await expect(applySignedReporterRevocation(
      database, reporter.id, signed(registered.privateKey, action), new Date('2026-08-23T10:05:01Z'),
    )).rejects.toMatchObject({ code: 'expired_request' })
    await expect(applySignedReporterRevocation(
      database, '98e9ed38-b33f-4aad-8c70-d667f26b4db5', signed(registered.privateKey, action),
      new Date('2026-08-23T10:00:00Z'),
    )).rejects.toMatchObject({ code: 'invalid_request' })
  })

  it('enforces account ownership for browser revocation', async () => {
    const [owner, other] = await database.insert(schema.users).values([
      { githubId: 'revoke-owner', handle: 'revoke-owner' },
      { githubId: 'revoke-other', handle: 'revoke-other' },
    ]).returning()
    const keys = pair()
    const [reporter] = await database.insert(schema.reporters).values({
      userId: owner.id, machineIdHash: 'owner-machine', machineLabel: 'Owner',
      publicKey: keys.publicKey, publicKeyFingerprint: 'owner-fp',
    }).returning()
    await expect(revokeOwnedReporter(database, other.id, reporter.id, false)).resolves.toBe(false)
    await expect(revokeOwnedReporter(database, owner.id, reporter.id, false)).resolves.toBe(true)
  })
})
