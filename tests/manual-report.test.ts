import { describe, it, expect } from 'vitest'
import { parseManualReportForm } from '../src/lib/manual-report'

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const validFields = {
  tool: 'Cursor',
  model: 'Sonnet',
  day: '2026-08-21',
  sessions: '3',
  costUsd: '4.50',
}

describe('parseManualReportForm', () => {
  it('normalizes tool and model and carries through day, sessions, and cost', () => {
    const [row] = parseManualReportForm(form(validFields))
    expect(row.tool).toBe('cursor')
    expect(row.model).toBe('sonnet')
    expect(row.day).toBe('2026-08-21')
    expect(row.sessions).toBe(3)
    expect(row.costUsd).toBe('4.5000')
  })

  // The rule this whole task exists to enforce, at the form boundary: a manual
  // entry can never mark itself verified, no matter what the form contains.
  it('always marks the row unverified, since there is no verified field on the form', () => {
    const [row] = parseManualReportForm(form(validFields))
    expect(row.verified).toBe(false)
  })

  it('always marks the source as manual', () => {
    const [row] = parseManualReportForm(form(validFields))
    expect(row.source).toBe('manual')
  })

  it('zeroes out token fields, since manual entries carry no token telemetry', () => {
    const [row] = parseManualReportForm(form(validFields))
    expect(row.tokensIn).toBe(0)
    expect(row.tokensOut).toBe(0)
    expect(row.cacheRead).toBe(0)
    expect(row.cacheWrite).toBe(0)
  })

  it('rejects a malformed day via the same schema the API route uses', () => {
    expect(() => parseManualReportForm(form({ ...validFields, day: 'not-a-date' }))).toThrow()
  })

  it('rejects a negative sessions count', () => {
    expect(() => parseManualReportForm(form({ ...validFields, sessions: '-1' }))).toThrow()
  })

  it('rejects a tool name that is symbols-only and slugs down to nothing', () => {
    expect(() => parseManualReportForm(form({ ...validFields, tool: '★★★' }))).toThrow()
  })
})
