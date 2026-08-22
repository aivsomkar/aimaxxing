import { reportSchema, normalizeReport, type NormalizedRow } from './ingest'

export type ManualReportField = 'tool' | 'model' | 'day' | 'sessions'
  | 'tokensIn' | 'tokensOut' | 'cacheRead' | 'cacheWrite' | 'costUsd'

export type ManualReportErrors = Partial<Record<ManualReportField, string>>

export type ManualReportState = {
  status: 'idle' | 'error' | 'success'
  message: string
  errors: ManualReportErrors
}

export type ManualReportValidation =
  | { success: true; rows: NormalizedRow[] }
  | { success: false; errors: ManualReportErrors }

export const initialManualReportState: ManualReportState = {
  status: 'idle', message: '', errors: {},
}

function numeric(formData: FormData, field: ManualReportField): number {
  const value = String(formData.get(field) ?? '').trim()
  return Number(value === '' ? 0 : value)
}

export function validateManualReportForm(formData: FormData): ManualReportValidation {
  const parsed = reportSchema.safeParse({
    days: [
      {
        tool: String(formData.get('tool') ?? ''),
        model: String(formData.get('model') ?? ''),
        day: String(formData.get('day') ?? ''),
        sessions: numeric(formData, 'sessions'),
        tokensIn: numeric(formData, 'tokensIn'),
        tokensOut: numeric(formData, 'tokensOut'),
        cacheRead: numeric(formData, 'cacheRead'),
        cacheWrite: numeric(formData, 'cacheWrite'),
        costUsd: numeric(formData, 'costUsd'),
      },
    ],
  })
  if (!parsed.success) {
    const errors: ManualReportErrors = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[2]
      if (typeof field === 'string' && !(field in errors)) {
        errors[field as ManualReportField] = issue.message
      }
    }
    return { success: false, errors }
  }

  const row = parsed.data.days[0]
  const total = row.sessions + row.tokensIn + row.tokensOut + row.cacheRead + row.cacheWrite + row.costUsd
  if (total <= 0) {
    return {
      success: false,
      errors: { sessions: 'Enter at least one session, token, or a positive spend.' },
    }
  }
  return { success: true, rows: normalizeReport(parsed.data, 'manual') }
}

export function parseManualReportForm(formData: FormData): NormalizedRow[] {
  const result = validateManualReportForm(formData)
  if (!result.success) throw new ManualReportValidationError(result.errors)
  return result.rows
}

export class ManualReportValidationError extends Error {
  constructor(public readonly errors: ManualReportErrors) {
    super('Manual report validation failed')
    this.name = 'ManualReportValidationError'
  }
}
