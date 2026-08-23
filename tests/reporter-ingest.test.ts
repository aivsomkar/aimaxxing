import { generateKeyPairSync, sign } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { eq } from 'drizzle-orm'
import * as schema from '../src/db/schema'
import { canonicalReportBytes, type UnsignedReporterReport } from '../src/lib/reporter-crypto'
import { applyReporterSnapshot, ReporterIngestError } from '../src/lib/reporter-ingest'

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  client = new PGlite()
  database = drizzle(client, { schema })
  await migrate(database, { migrationsFolder: 'drizzle' })
})

afterAll(async () => client.close())

function keys() {
  const pair = generateKeyPairSync('ed25519')
  return {
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKey: pair.privateKey,
  }
}

function signedReport(
  privateKey: ReturnType<typeof keys>['privateKey'],
  input: UnsignedReporterReport,
) {
  return {
    ...input,
    signature: sign(null, canonicalReportBytes(input), privateKey).toString('base64'),
  }
}

describe('reporter snapshot ingest', () => {
  it('rejects the legacy inclusive-cache pricing contract before it can overwrite corrected rows', async () => {
    const [user] = await database.insert(schema.users).values({
      githubId: 'legacy-contract-owner', handle: 'legacy-contract-owner',
    }).returning()
    const pair = keys()
    const [reporter] = await database.insert(schema.reporters).values({
      userId: user.id, machineIdHash: 'legacy-contract-machine', machineLabel: 'Legacy',
      publicKey: pair.publicKey, publicKeyFingerprint: 'legacy-contract-fp',
    }).returning()
    const input: UnsignedReporterReport = {
      reporterId: reporter.id, submissionId: 'legacy-contract-submission',
      issuedAt: '2026-08-23T10:00:00.000Z', pricingVersion: '2026-08-23',
      rows: [{
        tool: 'codex-cli', model: 'gpt-5.6-sol', day: '2026-08-23', sessions: 1,
        tokensIn: 1_000_000, tokensOut: 0, cacheRead: 900_000, cacheWrite: 0, costUsd: 5.45,
      }],
    }

    await expect(applyReporterSnapshot(
      database, signedReport(pair.privateKey, input), new Date('2026-08-23T10:00:00Z'),
    )).rejects.toMatchObject({ code: 'unsupported_pricing_version' })
    expect(await database.select().from(schema.reporterToolDays)
      .where(eq(schema.reporterToolDays.reporterId, reporter.id))).toHaveLength(0)
  })

  it('recomputes API-equivalent cost on the server instead of trusting the client value', async () => {
    const [user] = await database.insert(schema.users).values({
      githubId: 'server-pricing-owner', handle: 'server-pricing-owner',
    }).returning()
    const pair = keys()
    const [reporter] = await database.insert(schema.reporters).values({
      userId: user.id, machineIdHash: 'server-pricing-machine', machineLabel: 'Current',
      publicKey: pair.publicKey, publicKeyFingerprint: 'server-pricing-fp',
    }).returning()
    const input: UnsignedReporterReport = {
      reporterId: reporter.id, submissionId: 'server-pricing-submission',
      issuedAt: '2026-08-23T10:00:00.000Z', pricingVersion: '2026-08-23.1',
      rows: [{
        tool: 'codex-cli', model: 'gpt-5.6-sol', day: '2026-08-23', sessions: 1,
        tokensIn: 1_000_000, tokensOut: 1_000_000,
        cacheRead: 1_000_000, cacheWrite: 1_000_000, costUsd: 999,
      }],
    }

    await expect(applyReporterSnapshot(
      database, signedReport(pair.privateKey, input), new Date('2026-08-23T10:00:00Z'),
    )).resolves.toMatchObject({ accepted: 1 })
    const [stored] = await database.select().from(schema.reporterToolDays)
      .where(eq(schema.reporterToolDays.reporterId, reporter.id))
    expect(stored.costUsd).toBe('41.7500')
  })

  it('preserves the cost recorded by OpenCode for its own sessions', async () => {
    const [user] = await database.insert(schema.users).values({
      githubId: 'opencode-pricing-owner', handle: 'opencode-pricing-owner',
    }).returning()
    const pair = keys()
    const [reporter] = await database.insert(schema.reporters).values({
      userId: user.id, machineIdHash: 'opencode-pricing-machine', machineLabel: 'OpenCode',
      publicKey: pair.publicKey, publicKeyFingerprint: 'opencode-pricing-fp',
    }).returning()
    const input: UnsignedReporterReport = {
      reporterId: reporter.id, submissionId: 'opencode-pricing-submission',
      issuedAt: '2026-08-23T10:00:00.000Z', pricingVersion: '2026-08-23.1',
      rows: [{
        tool: 'opencode', model: 'vendor/private-model', day: '2026-08-23', sessions: 1,
        tokensIn: 1_000_000, tokensOut: 1_000_000,
        cacheRead: 0, cacheWrite: 0, costUsd: 12.34,
      }],
    }

    await expect(applyReporterSnapshot(
      database, signedReport(pair.privateKey, input), new Date('2026-08-23T10:00:00Z'),
    )).resolves.toMatchObject({ accepted: 1 })
    const [stored] = await database.select().from(schema.reporterToolDays)
      .where(eq(schema.reporterToolDays.reporterId, reporter.id))
    expect(stored.costUsd).toBe('12.3400')
  })

  it('rejects malformed reporter IDs before issuing a database UUID query', async () => {
    await expect(applyReporterSnapshot(database, {
      reporterId: 'not-a-uuid',
      submissionId: 'malformed-id',
      issuedAt: '2026-08-23T10:00:00.000Z',
      pricingVersion: '2026-08-23',
      rows: [],
      signature: 'invalid',
    }, new Date('2026-08-23T10:00:00Z'))).rejects.toMatchObject({ code: 'invalid_report' })
  })

  it('replaces only the submitting reporter snapshot and rejects replay atomically', async () => {
    const [user] = await database.insert(schema.users).values({
      githubId: 'ingest-owner', handle: 'ingest-owner', publicOptIn: true,
    }).returning()
    const a = keys()
    const b = keys()
    const [reporterA, reporterB] = await database.insert(schema.reporters).values([
      {
        userId: user.id, machineIdHash: 'ingest-machine-a', machineLabel: 'A',
        publicKey: a.publicKey, publicKeyFingerprint: 'ingest-fp-a',
      },
      {
        userId: user.id, machineIdHash: 'ingest-machine-b', machineLabel: 'B',
        publicKey: b.publicKey, publicKeyFingerprint: 'ingest-fp-b',
      },
    ]).returning()
    await database.insert(schema.toolDays).values({
      userId: user.id, tool: 'manual', model: 'manual-model', day: '2026-08-20',
      sessions: 1, costUsd: '2.0000', source: 'manual', verified: false,
    })
    await database.insert(schema.reporterToolDays).values({
      reporterId: reporterB.id, userId: user.id, tool: 'opencode', model: 'other-model',
      day: '2026-08-22', sessions: 1, costUsd: '3.0000',
    })

    const first: UnsignedReporterReport = {
      reporterId: reporterA.id, submissionId: 'ingest-submission-1',
      issuedAt: '2026-08-23T10:00:00.000Z', pricingVersion: '2026-08-23.1',
      rows: [
        {
          tool: 'codex-cli', model: 'gpt-5.2', day: '2026-08-22', sessions: 2,
          tokensIn: 10, tokensOut: 20, cacheRead: 30, cacheWrite: 40, costUsd: 1.25,
        },
        {
          tool: 'claude-code', model: 'claude-opus-4-1', day: '2026-08-23', sessions: 1,
          tokensIn: 5, tokensOut: 6, cacheRead: 7, cacheWrite: 8, costUsd: 2.5,
        },
      ],
    }
    await expect(applyReporterSnapshot(
      database, signedReport(a.privateKey, first), new Date('2026-08-23T10:00:00Z'),
    )).resolves.toEqual({ accepted: 2, submissionId: first.submissionId })

    await expect(applyReporterSnapshot(
      database, signedReport(a.privateKey, first), new Date('2026-08-23T10:00:01Z'),
    )).rejects.toMatchObject({ code: 'replayed_submission' })

    const second: UnsignedReporterReport = {
      ...first, submissionId: 'ingest-submission-2', issuedAt: '2026-08-23T10:01:00.000Z',
      rows: [{ ...first.rows[0], sessions: 9, costUsd: 4.5 }],
    }
    await applyReporterSnapshot(
      database, signedReport(a.privateKey, second), new Date('2026-08-23T10:01:00Z'),
    )

    const rowsA = await database.select().from(schema.reporterToolDays)
      .where(eq(schema.reporterToolDays.reporterId, reporterA.id))
    expect(rowsA).toHaveLength(1)
    expect(rowsA[0]).toMatchObject({ tool: 'codex-cli', sessions: 9, costUsd: '0.0000' })
    expect(await database.select().from(schema.reporterToolDays)
      .where(eq(schema.reporterToolDays.reporterId, reporterB.id))).toHaveLength(1)
    expect(await database.select().from(schema.toolDays)
      .where(eq(schema.toolDays.userId, user.id))).toHaveLength(1)
  })

  it('rejects revoked reporters and invalid rows without changing stored data', async () => {
    const [user] = await database.insert(schema.users).values({
      githubId: 'revoked-owner', handle: 'revoked-owner',
    }).returning()
    const pair = keys()
    const [reporter] = await database.insert(schema.reporters).values({
      userId: user.id, machineIdHash: 'revoked-machine', machineLabel: 'Revoked',
      publicKey: pair.publicKey, publicKeyFingerprint: 'revoked-fp', revokedAt: new Date(),
    }).returning()
    const input: UnsignedReporterReport = {
      reporterId: reporter.id, submissionId: 'revoked-submission',
      issuedAt: '2026-08-23T10:00:00.000Z', pricingVersion: '2026-08-23.1',
      rows: [{
        tool: 'codex-cli', model: 'gpt-5.2', day: '2026-08-23', sessions: 1,
        tokensIn: 1, tokensOut: 1, cacheRead: 0, cacheWrite: 0, costUsd: 0.1,
      }],
    }
    await expect(applyReporterSnapshot(
      database, signedReport(pair.privateKey, input), new Date('2026-08-23T10:00:00Z'),
    )).rejects.toMatchObject({ code: 'revoked_reporter' })
    expect(await database.select().from(schema.reporterToolDays)
      .where(eq(schema.reporterToolDays.reporterId, reporter.id))).toHaveLength(0)
  })

  it('rejects reports whose signature belongs to another key', async () => {
    const [user] = await database.insert(schema.users).values({
      githubId: 'wrong-key-owner', handle: 'wrong-key-owner',
    }).returning()
    const registered = keys()
    const attacker = keys()
    const [reporter] = await database.insert(schema.reporters).values({
      userId: user.id, machineIdHash: 'wrong-key-machine', machineLabel: 'Wrong key',
      publicKey: registered.publicKey, publicKeyFingerprint: 'wrong-key-fp',
    }).returning()
    const input: UnsignedReporterReport = {
      reporterId: reporter.id, submissionId: 'wrong-key-submission',
      issuedAt: '2026-08-23T10:00:00.000Z', pricingVersion: '2026-08-23.1', rows: [],
    }
    await expect(applyReporterSnapshot(
      database, signedReport(attacker.privateKey, input), new Date('2026-08-23T10:00:00Z'),
    )).rejects.toBeInstanceOf(ReporterIngestError)
  })
})
