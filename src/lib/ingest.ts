import { z } from 'zod'
import { toolDays } from '@/db/schema'

const MAX_COST_PER_DAY = 100_000
const MAX_TOKENS_PER_DAY = 10_000_000_000

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9.+-]+/g, '-').replace(/^-+|-+$/g, '')

// A string can pass .min(1) yet slug down to '' (symbol-only or CJK-only input,
// which the slug charset strips entirely) — reject that here rather than storing
// a blank tool/model bucket that shows up as an empty row in aggregates.
const slugsToSomething = (s: string) => slug(s).length > 0

const dayRow = z.object({
  tool: z.string().min(1).max(60).refine(slugsToSomething, 'must contain at least one slug-able character'),
  model: z.string().min(1).max(60).refine(slugsToSomething, 'must contain at least one slug-able character'),
  // Format AND calendar validity: "2026-13-99" matches the regex but the DB rejects it,
  // which would surface as an unhandled 500 rather than a clean 400.
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => {
    const parsed = new Date(`${d}T00:00:00Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === d
  }, 'not a real calendar date'),
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

// Loose enough to accept both the pglite-backed and node-postgres-backed
// drizzle instances src/db/client.ts can hand back, without importing that
// module (and its side-effecting connection setup) into a lib file.
type Transactable = { transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> }

// Writes a normalized report as one all-or-nothing transaction. Without this,
// a batch that fails partway through (e.g. a row that trips a DB-level
// constraint the zod schema didn't catch) would leave earlier rows in the
// same batch committed, with the caller seeing only a generic failure and no
// way to tell what actually landed.
export async function writeReport(database: Transactable, userId: number, rows: NormalizedRow[]): Promise<void> {
  await database.transaction(async (tx: any) => {
    for (const r of rows) {
      await tx.insert(toolDays).values({ userId, ...r })
        .onConflictDoUpdate({
          target: [toolDays.userId, toolDays.tool, toolDays.model, toolDays.day],
          set: { ...r },
        })
    }
  })
}
