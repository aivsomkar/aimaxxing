import { createPublicKey, verify } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { reporterActionRequests, reporterToolDays, reporters } from '@/db/schema'

type Database = {
  select: (...args: any[]) => any
  insert: (...args: any[]) => any
  update: (...args: any[]) => any
  delete: (...args: any[]) => any
  transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>
}

const unsignedActionSchema = z.object({
  reporterId: z.string().uuid(),
  action: z.literal('revoke'),
  issuedAt: z.string().datetime({ offset: true }),
  requestId: z.string().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/),
  deleteData: z.boolean(),
}).strict()

const signedActionSchema = z.object({
  reporterId: z.string().uuid(),
  action: z.literal('revoke'),
  issuedAt: z.string().datetime({ offset: true }),
  requestId: z.string().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/),
  deleteData: z.boolean(),
  signature: z.string().min(1).max(256),
}).strict()

export type UnsignedReporterAction = z.infer<typeof unsignedActionSchema>

export type ReporterRevokeCode =
  | 'invalid_request'
  | 'unknown_reporter'
  | 'revoked_reporter'
  | 'expired_request'
  | 'invalid_signature'
  | 'replayed_request'

export class ReporterRevokeError extends Error {
  constructor(public readonly code: ReporterRevokeCode, message: string) {
    super(message)
    this.name = 'ReporterRevokeError'
  }
}

export function canonicalReporterActionBytes(action: UnsignedReporterAction): Buffer {
  return Buffer.from(JSON.stringify({
    reporterId: action.reporterId,
    action: action.action,
    issuedAt: action.issuedAt,
    requestId: action.requestId,
    deleteData: action.deleteData,
  }), 'utf8')
}

function signatureBytes(value: string): Buffer {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new ReporterRevokeError('invalid_signature', 'Invalid signature')
  }
  const bytes = Buffer.from(value, 'base64')
  if (bytes.length !== 64 || bytes.toString('base64') !== value) {
    throw new ReporterRevokeError('invalid_signature', 'Invalid signature')
  }
  return bytes
}

export async function applySignedReporterRevocation(
  database: Database,
  pathReporterId: string,
  value: unknown,
  now = new Date(),
): Promise<{ deletedData: boolean }> {
  const parsed = signedActionSchema.safeParse(value)
  if (!parsed.success || parsed.data.reporterId !== pathReporterId) {
    throw new ReporterRevokeError('invalid_request', 'Invalid revocation request')
  }
  const signed = parsed.data
  const issuedAt = new Date(signed.issuedAt)
  if (Math.abs(now.getTime() - issuedAt.getTime()) > 5 * 60_000) {
    throw new ReporterRevokeError('expired_request', 'Revocation timestamp is outside the five-minute window')
  }

  return database.transaction(async (transaction) => {
    const [reporter] = await transaction.select().from(reporters)
      .where(eq(reporters.id, pathReporterId))
    if (!reporter) throw new ReporterRevokeError('unknown_reporter', 'Reporter is not linked')

    const { signature, ...action } = signed
    let publicKey
    try { publicKey = createPublicKey(reporter.publicKey) } catch {
      throw new ReporterRevokeError('invalid_signature', 'Reporter signature is invalid')
    }
    if (publicKey.asymmetricKeyType !== 'ed25519'
      || !verify(null, canonicalReporterActionBytes(action), publicKey, signatureBytes(signature))) {
      throw new ReporterRevokeError('invalid_signature', 'Reporter signature is invalid')
    }

    const [replayed] = await transaction.select({ id: reporterActionRequests.id })
      .from(reporterActionRequests).where(and(
        eq(reporterActionRequests.reporterId, pathReporterId),
        eq(reporterActionRequests.requestId, action.requestId),
      ))
    if (replayed) throw new ReporterRevokeError('replayed_request', 'Revocation request was already used')
    if (reporter.revokedAt) throw new ReporterRevokeError('revoked_reporter', 'Reporter has already been revoked')

    const inserted = await transaction.insert(reporterActionRequests).values({
      reporterId: pathReporterId,
      requestId: action.requestId,
      action: action.action,
      receivedAt: now,
    }).onConflictDoNothing({
      target: [reporterActionRequests.reporterId, reporterActionRequests.requestId],
    }).returning({ id: reporterActionRequests.id })
    if (inserted.length !== 1) {
      throw new ReporterRevokeError('replayed_request', 'Revocation request was already used')
    }
    if (action.deleteData) {
      await transaction.delete(reporterToolDays).where(eq(reporterToolDays.reporterId, pathReporterId))
    }
    const revoked = await transaction.update(reporters).set({ revokedAt: now }).where(and(
      eq(reporters.id, pathReporterId),
      isNull(reporters.revokedAt),
    )).returning({ id: reporters.id })
    if (revoked.length !== 1) {
      throw new ReporterRevokeError('revoked_reporter', 'Reporter has already been revoked')
    }
    return { deletedData: action.deleteData }
  })
}

export async function revokeOwnedReporter(
  database: Database,
  userId: number,
  reporterId: string,
  deleteData: boolean,
  now = new Date(),
): Promise<boolean> {
  return database.transaction(async (transaction) => {
    const [owned] = await transaction.select({ id: reporters.id }).from(reporters).where(and(
      eq(reporters.id, reporterId),
      eq(reporters.userId, userId),
    ))
    if (!owned) return false
    if (deleteData) {
      await transaction.delete(reporterToolDays).where(eq(reporterToolDays.reporterId, reporterId))
    }
    await transaction.update(reporters).set({ revokedAt: now }).where(and(
      eq(reporters.id, reporterId),
      eq(reporters.userId, userId),
      isNull(reporters.revokedAt),
    ))
    return true
  })
}
