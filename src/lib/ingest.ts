import { z } from 'zod'

const MAX_COST_PER_DAY = 100_000
const MAX_TOKENS_PER_DAY = 10_000_000_000

const dayRow = z.object({
  tool: z.string().min(1).max(60),
  model: z.string().min(1).max(60),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sessions: z.number().int().min(0).max(100_000),
  tokensIn: z.number().int().min(0).max(MAX_TOKENS_PER_DAY),
  tokensOut: z.number().int().min(0).max(MAX_TOKENS_PER_DAY),
  cacheRead: z.number().int().min(0).max(MAX_TOKENS_PER_DAY),
  cacheWrite: z.number().int().min(0).max(MAX_TOKENS_PER_DAY),
  costUsd: z.number().min(0).max(MAX_COST_PER_DAY),
})

export const reportSchema = z.object({ days: z.array(dayRow).min(1).max(2000) })
export type ReportPayload = z.infer<typeof reportSchema>

export type NormalizedRow = {
  tool: string; model: string; day: string; sessions: number
  tokensIn: number; tokensOut: number; cacheRead: number; cacheWrite: number
  costUsd: string; source: string; verified: boolean
}

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9.+-]+/g, '-').replace(/^-+|-+$/g, '')

export function normalizeReport(p: ReportPayload, source: 'reporter' | 'manual'): NormalizedRow[] {
  return p.days.map((d) => ({
    tool: slug(d.tool),
    model: slug(d.model),
    day: d.day,
    sessions: d.sessions,
    tokensIn: d.tokensIn, tokensOut: d.tokensOut,
    cacheRead: d.cacheRead, cacheWrite: d.cacheWrite,
    costUsd: d.costUsd.toFixed(4),
    source,
    verified: source === 'reporter',
  }))
}
