import { createHash, timingSafeEqual } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import {
  reporterLinkSessions,
  reporterSubmissions,
  reporterToolDays,
  reporters,
  users,
} from '@/db/schema'

type Database = {
  select: (...args: any[]) => any
  insert: (...args: any[]) => any
  update: (...args: any[]) => any
  delete: (...args: any[]) => any
  transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>
}

export function hashReporterSecret(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function secretMatches(value: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashReporterSecret(value), 'hex')
  const expected = Buffer.from(expectedHash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export async function createLinkSession(database: Database, input: {
  deviceCode: string
  userCode: string
  publicKey: string
  publicKeyFingerprint: string
  machineIdHash: string
  machineLabel: string
  expiresAt: Date
}) {
  const [created] = await database.insert(reporterLinkSessions).values({
    deviceCodeHash: hashReporterSecret(input.deviceCode),
    userCodeHash: hashReporterSecret(input.userCode),
    publicKey: input.publicKey,
    publicKeyFingerprint: input.publicKeyFingerprint,
    machineIdHash: input.machineIdHash,
    machineLabel: input.machineLabel,
    expiresAt: input.expiresAt,
  }).returning()
  return created
}

export async function approveLinkSession(
  database: Database,
  userCode: string,
  userId: number,
  now = new Date(),
) {
  const hash = hashReporterSecret(userCode)
  const [link] = await database.select().from(reporterLinkSessions)
    .where(eq(reporterLinkSessions.userCodeHash, hash))
  if (!link || !secretMatches(userCode, link.userCodeHash) || link.expiresAt <= now
    || link.approvedAt || link.deniedAt || link.consumedAt) return null
  const [approved] = await database.update(reporterLinkSessions).set({
    userId,
    approvedAt: now,
  }).where(and(
    eq(reporterLinkSessions.id, link.id),
    isNull(reporterLinkSessions.approvedAt),
    isNull(reporterLinkSessions.deniedAt),
    isNull(reporterLinkSessions.consumedAt),
  )).returning()
  return approved ?? null
}

export async function findLinkSessionByUserCode(
  database: Database,
  userCode: string,
  now = new Date(),
) {
  const hash = hashReporterSecret(userCode)
  const [link] = await database.select().from(reporterLinkSessions)
    .where(eq(reporterLinkSessions.userCodeHash, hash))
  if (!link || !secretMatches(userCode, link.userCodeHash) || link.expiresAt <= now
    || link.approvedAt || link.deniedAt || link.consumedAt) return null
  return link
}

export async function denyLinkSession(
  database: Database,
  userCode: string,
  userId: number,
  now = new Date(),
): Promise<boolean> {
  const link = await findLinkSessionByUserCode(database, userCode, now)
  if (!link || link.approvedAt) return false
  const rows = await database.update(reporterLinkSessions).set({
    userId,
    deniedAt: now,
  }).where(and(
    eq(reporterLinkSessions.id, link.id),
    isNull(reporterLinkSessions.approvedAt),
    isNull(reporterLinkSessions.deniedAt),
    isNull(reporterLinkSessions.consumedAt),
  )).returning({ id: reporterLinkSessions.id })
  return rows.length === 1
}

export async function getLinkStatus(database: Database, deviceCode: string, now = new Date()) {
  const hash = hashReporterSecret(deviceCode)
  const [link] = await database.select().from(reporterLinkSessions)
    .where(eq(reporterLinkSessions.deviceCodeHash, hash))
  if (!link || !secretMatches(deviceCode, link.deviceCodeHash) || link.deniedAt) return { status: 'denied' as const }
  if (link.expiresAt <= now) return { status: 'expired' as const }
  if (link.reporterId && link.userId) {
    const [owner] = await database.select({ handle: users.handle }).from(users)
      .where(eq(users.id, link.userId))
    return owner
      ? { status: 'approved' as const, reporterId: link.reporterId, handle: owner.handle }
      : { status: 'denied' as const }
  }
  if (link.approvedAt) return { status: 'pending_approval_consumption' as const }
  return { status: 'pending' as const }
}

export async function consumeApprovedLink(database: Database, deviceCode: string, now = new Date()) {
  return database.transaction(async (transaction) => {
    const hash = hashReporterSecret(deviceCode)
    const [link] = await transaction.select().from(reporterLinkSessions)
      .where(eq(reporterLinkSessions.deviceCodeHash, hash))
    if (!link || !secretMatches(deviceCode, link.deviceCodeHash) || link.expiresAt <= now
      || !link.approvedAt || !link.userId || link.deniedAt || link.consumedAt || link.reporterId) return null
    const [reporter] = await transaction.insert(reporters).values({
      userId: link.userId,
      machineIdHash: link.machineIdHash,
      machineLabel: link.machineLabel,
      publicKey: link.publicKey,
      publicKeyFingerprint: link.publicKeyFingerprint,
      linkedAt: now,
    }).returning()
    const [consumed] = await transaction.update(reporterLinkSessions).set({
      reporterId: reporter.id,
      consumedAt: now,
    }).where(and(
      eq(reporterLinkSessions.id, link.id),
      isNull(reporterLinkSessions.consumedAt),
      isNull(reporterLinkSessions.reporterId),
    )).returning()
    return consumed ? reporter : null
  })
}

export async function revokeReporter(
  database: Database,
  userId: number,
  reporterId: string,
  now = new Date(),
): Promise<boolean> {
  const rows = await database.update(reporters).set({ revokedAt: now }).where(and(
    eq(reporters.id, reporterId),
    eq(reporters.userId, userId),
    isNull(reporters.revokedAt),
  )).returning({ id: reporters.id })
  return rows.length === 1
}

export async function deleteReporterData(
  database: Database,
  userId: number,
  reporterId: string,
): Promise<boolean> {
  // Deleting the synced usage must also revoke the reporter: otherwise the
  // still-linked device's next signed snapshot would re-upload every row the
  // user just asked to destroy. Revocation is idempotent, so re-deleting an
  // already-revoked device's leftovers still works.
  return database.transaction(async (transaction) => {
    const rows = await transaction.update(reporters).set({ revokedAt: new Date() }).where(and(
      eq(reporters.id, reporterId),
      eq(reporters.userId, userId),
    )).returning({ id: reporters.id })
    if (rows.length !== 1) return false
    await transaction.delete(reporterToolDays).where(eq(reporterToolDays.reporterId, reporterId))
    return true
  })
}

export async function recordReporterSubmission(database: Database, input: {
  id: string
  reporterId: string
  payloadHash: string
  pricingVersion: string
}): Promise<boolean> {
  const rows = await database.insert(reporterSubmissions).values(input)
    .onConflictDoNothing({ target: reporterSubmissions.id })
    .returning({ id: reporterSubmissions.id })
  return rows.length === 1
}
