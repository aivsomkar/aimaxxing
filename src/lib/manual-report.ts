import { reportSchema, normalizeReport, type NormalizedRow } from './ingest'

// Parses the /report form into a single normalized row. Only tool, model,
// day, sessions, and costUsd are reader-supplied; token counts are always
// zero (manual entries carry no token telemetry). The form has no field for
// verified or sponsored, and normalizeReport hardcodes verified=false for
// source 'manual' regardless of input - a manual entry can never mark itself
// verified or sponsored through this path.
export function parseManualReportForm(formData: FormData): NormalizedRow[] {
  const parsed = reportSchema.parse({
    days: [
      {
        tool: String(formData.get('tool')),
        model: String(formData.get('model')),
        day: String(formData.get('day')),
        sessions: Number(formData.get('sessions')),
        tokensIn: 0,
        tokensOut: 0,
        cacheRead: 0,
        cacheWrite: 0,
        costUsd: Number(formData.get('costUsd')),
      },
    ],
  })
  return normalizeReport(parsed, 'manual')
}
