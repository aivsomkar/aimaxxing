import { createHash } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { reporterSubmissions, reporterToolDays, reporters } from '@/db/schema'
import {
  canonicalReportBytes,
  ReporterVerificationError,
  signedReporterReportSchema,
  verifySignedReport,
  type SignedReporterReport,
} from './reporter-crypto'

type Database = {
  select: (...args: any[]) => any
  insert: (...args: any[]) => any
  update: (...args: any[]) => any
  delete: (...args: any[]) => any
  transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>
}

export type ReporterIngestCode =
  | 'invalid_report'
  | 'unknown_reporter'
  | 'revoked_reporter'
  | 'expired_report'
  | 'invalid_signature'
  | 'replayed_submission'

export class ReporterIngestError extends Error {
  constructor(public readonly code: ReporterIngestCode, message: string) {
    super(message)
    this.name = 'ReporterIngestError'
  }
}

function mapVerificationError(error: unknown): never {
  if (!(error instanceof ReporterVerificationError)) throw error
  const code = error.code === 'invalid_public_key' ? 'invalid_signature' : error.code
  throw new ReporterIngestError(code, error.message)
}

function rowKey(row: { tool: string; model: string; day: string }) {
  return `${row.tool}\u0000${row.model}\u0000${row.day}`
}

export async function applyReporterSnapshot(
  database: Database,
  value: unknown,
  now = new Date(),
): Promise<{ accepted: number; submissionId: string }> {
  const parsedCandidate = signedReporterReportSchema.safeParse(value)
  if (!parsedCandidate.success) {
    throw new ReporterIngestError('invalid_report', 'Invalid reporter payload')
  }
  const candidate = parsedCandidate.data

  return database.transaction(async (transaction) => {
    const [reporter] = await transaction.select().from(reporters).where(and(
      eq(reporters.id, candidate.reporterId),
      isNull(reporters.revokedAt),
    ))
    if (!reporter) {
      const [known] = await transaction.select({ revokedAt: reporters.revokedAt })
        .from(reporters).where(eq(reporters.id, candidate.reporterId))
      throw new ReporterIngestError(
        known?.revokedAt ? 'revoked_reporter' : 'unknown_reporter',
        known?.revokedAt ? 'Reporter has been revoked' : 'Reporter is not linked',
      )
    }

    let report: SignedReporterReport
    try {
      report = verifySignedReport(candidate, reporter.publicKey, now)
    } catch (error) {
      mapVerificationError(error)
    }

    const { signature: _signature, ...unsigned } = report
    const payloadHash = createHash('sha256').update(canonicalReportBytes(unsigned)).digest('hex')
    const insertedSubmission = await transaction.insert(reporterSubmissions).values({
      id: report.submissionId,
      reporterId: reporter.id,
      payloadHash,
      pricingVersion: report.pricingVersion,
      receivedAt: now,
    }).onConflictDoNothing({ target: reporterSubmissions.id })
      .returning({ id: reporterSubmissions.id })
    if (insertedSubmission.length !== 1) {
      throw new ReporterIngestError('replayed_submission', 'Submission was already accepted')
    }

    for (const row of report.rows) {
      await transaction.insert(reporterToolDays).values({
        reporterId: reporter.id,
        userId: reporter.userId,
        ...row,
        costUsd: row.costUsd.toFixed(4),
        createdAt: now,
      }).onConflictDoUpdate({
        target: [
          reporterToolDays.reporterId,
          reporterToolDays.tool,
          reporterToolDays.model,
          reporterToolDays.day,
        ],
        set: {
          sessions: row.sessions,
          tokensIn: row.tokensIn,
          tokensOut: row.tokensOut,
          cacheRead: row.cacheRead,
          cacheWrite: row.cacheWrite,
          costUsd: row.costUsd.toFixed(4),
        },
      })
    }

    const acceptedKeys = new Set(report.rows.map(rowKey))
    const storedRows = await transaction.select({
      id: reporterToolDays.id,
      tool: reporterToolDays.tool,
      model: reporterToolDays.model,
      day: reporterToolDays.day,
    }).from(reporterToolDays).where(eq(reporterToolDays.reporterId, reporter.id))
    for (const stored of storedRows) {
      if (!acceptedKeys.has(rowKey(stored))) {
        await transaction.delete(reporterToolDays).where(eq(reporterToolDays.id, stored.id))
      }
    }

    await transaction.update(reporters).set({ lastSeenAt: now })
      .where(and(eq(reporters.id, reporter.id), isNull(reporters.revokedAt)))
    return { accepted: report.rows.length, submissionId: report.submissionId }
  })
}
