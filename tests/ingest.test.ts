import { describe, it, expect } from 'vitest'
import { reportSchema, normalizeReport } from '../src/lib/ingest'

const payload = {
  days: [{
    tool: 'Claude Code', model: 'Opus', day: '2026-08-21',
    sessions: 4, tokensIn: 100, tokensOut: 50, cacheRead: 10, cacheWrite: 5, costUsd: 1.25,
  }],
}

describe('reportSchema', () => {
  it('rejects negative token counts', () => {
    const bad = { days: [{ ...payload.days[0], tokensIn: -1 }] }
    expect(reportSchema.safeParse(bad).success).toBe(false)
  })
  it('rejects a malformed day', () => {
    const bad = { days: [{ ...payload.days[0], day: '21-08-2026' }] }
    expect(reportSchema.safeParse(bad).success).toBe(false)
  })
  it('rejects a payload above the sanity cap', () => {
    const bad = { days: [{ ...payload.days[0], costUsd: 1_000_000 }] }
    expect(reportSchema.safeParse(bad).success).toBe(false)
  })
  it('accepts a well-formed payload', () => {
    expect(reportSchema.safeParse(payload).success).toBe(true)
  })
})

describe('normalizeReport', () => {
  it('lowercases and slugs tool and model so boards group correctly', () => {
    const [row] = normalizeReport(reportSchema.parse(payload), 'reporter')
    expect(row.tool).toBe('claude-code')
    expect(row.model).toBe('opus')
  })
  it('marks reporter rows verified and manual rows not', () => {
    expect(normalizeReport(reportSchema.parse(payload), 'reporter')[0].verified).toBe(true)
    expect(normalizeReport(reportSchema.parse(payload), 'manual')[0].verified).toBe(false)
  })
  it('renders cost as a fixed-scale string to avoid float drift in the ledger', () => {
    expect(normalizeReport(reportSchema.parse(payload), 'manual')[0].costUsd).toBe('1.2500')
  })
})
