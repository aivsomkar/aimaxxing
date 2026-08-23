import { createPublicKey, verify } from 'node:crypto'
import { z } from 'zod'

const MAX_CLOCK_SKEW_MS = 5 * 60_000
const MAX_ROWS = 2_000
const MAX_TOKENS = 10_000_000_000
const MAX_SESSIONS = 100_000
const MAX_COST_USD = 100_000

const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}, 'Invalid calendar day')

export const reporterUsageRowSchema = z.object({
  tool: z.enum(['claude-code', 'codex-cli', 'opencode']),
  model: z.string().trim().min(1).max(200),
  day: calendarDay,
  sessions: z.number().int().nonnegative().max(MAX_SESSIONS),
  tokensIn: z.number().int().nonnegative().max(MAX_TOKENS),
  tokensOut: z.number().int().nonnegative().max(MAX_TOKENS),
  cacheRead: z.number().int().nonnegative().max(MAX_TOKENS),
  cacheWrite: z.number().int().nonnegative().max(MAX_TOKENS),
  costUsd: z.number().finite().nonnegative().max(MAX_COST_USD),
}).strict()

function rejectDuplicateRows(
  report: { rows: ReporterUsageRow[] },
  context: z.RefinementCtx,
) {
  const seen = new Set<string>()
  report.rows.forEach((row, index) => {
    const key = `${row.tool}\u0000${row.model}\u0000${row.day}`
    if (seen.has(key)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Duplicate tool/model/day row',
        path: ['rows', index],
      })
    }
    seen.add(key)
  })
}

export const unsignedReporterReportSchema = z.object({
  reporterId: z.string().uuid(),
  submissionId: z.string().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/),
  issuedAt: z.string().datetime({ offset: true }),
  pricingVersion: z.string().regex(/^\d{4}-\d{2}-\d{2}(?:\.\d+)?$/),
  rows: z.array(reporterUsageRowSchema).max(MAX_ROWS),
}).strict().superRefine(rejectDuplicateRows)

export const signedReporterReportSchema = z.object({
  reporterId: z.string().uuid(),
  submissionId: z.string().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/),
  issuedAt: z.string().datetime({ offset: true }),
  pricingVersion: z.string().regex(/^\d{4}-\d{2}-\d{2}(?:\.\d+)?$/),
  rows: z.array(reporterUsageRowSchema).max(MAX_ROWS),
  signature: z.string().min(1).max(256),
}).strict().superRefine(rejectDuplicateRows)

export type ReporterUsageRow = z.infer<typeof reporterUsageRowSchema>
export type UnsignedReporterReport = z.infer<typeof unsignedReporterReportSchema>
export type SignedReporterReport = z.infer<typeof signedReporterReportSchema>

export type ReporterVerificationCode =
  | 'invalid_report'
  | 'invalid_public_key'
  | 'invalid_signature'
  | 'expired_report'

export class ReporterVerificationError extends Error {
  constructor(public readonly code: ReporterVerificationCode, message: string) {
    super(message)
    this.name = 'ReporterVerificationError'
  }
}

function canonicalRow(row: ReporterUsageRow) {
  return {
    tool: row.tool,
    model: row.model,
    day: row.day,
    sessions: row.sessions,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    cacheRead: row.cacheRead,
    cacheWrite: row.cacheWrite,
    costUsd: row.costUsd,
  }
}

export function canonicalReportBytes(report: UnsignedReporterReport): Buffer {
  return Buffer.from(JSON.stringify({
    reporterId: report.reporterId,
    submissionId: report.submissionId,
    issuedAt: report.issuedAt,
    pricingVersion: report.pricingVersion,
    rows: report.rows.map(canonicalRow),
  }), 'utf8')
}

function parseSignature(value: string): Buffer {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new ReporterVerificationError('invalid_signature', 'Invalid signature encoding')
  }
  const signature = Buffer.from(value, 'base64')
  if (signature.length !== 64 || signature.toString('base64') !== value) {
    throw new ReporterVerificationError('invalid_signature', 'Invalid signature encoding')
  }
  return signature
}

export function verifySignedReport(
  value: unknown,
  publicKeyPem: string,
  now = new Date(),
): SignedReporterReport {
  const parsed = signedReporterReportSchema.safeParse(value)
  if (!parsed.success) {
    throw new ReporterVerificationError('invalid_report', 'Invalid reporter payload')
  }
  const report = parsed.data
  const issuedAt = new Date(report.issuedAt)
  if (Math.abs(now.getTime() - issuedAt.getTime()) > MAX_CLOCK_SKEW_MS) {
    throw new ReporterVerificationError('expired_report', 'Report timestamp is outside the five-minute window')
  }

  let publicKey
  try {
    publicKey = createPublicKey(publicKeyPem)
  } catch {
    throw new ReporterVerificationError('invalid_public_key', 'Reporter public key is invalid')
  }
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    throw new ReporterVerificationError('invalid_public_key', 'Reporter public key must be Ed25519')
  }

  const signature = parseSignature(report.signature)
  const { signature: _signature, ...unsigned } = report
  if (!verify(null, canonicalReportBytes(unsigned), publicKey, signature)) {
    throw new ReporterVerificationError('invalid_signature', 'Reporter signature does not match the payload')
  }
  return report
}
