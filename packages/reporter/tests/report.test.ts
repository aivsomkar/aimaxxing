import { describe, expect, it } from 'vitest'
import { mergeAggregates, serializeReportRows } from '../src/report'
import type { UsageObservation } from '../src/adapters/types'

function observation(overrides: Partial<UsageObservation> = {}): UsageObservation {
  return {
    recordId: 'record-1',
    sessionId: 'session-1',
    tool: 'claude-code',
    model: 'claude-opus-4-1',
    day: '2026-08-22',
    tokensIn: 10,
    tokensOut: 20,
    cacheRead: 30,
    cacheWrite: 40,
    costUsd: 1.25,
    ...overrides,
  }
}

describe('mergeAggregates', () => {
  it('groups by tool, model, and day while counting distinct sessions', () => {
    expect(mergeAggregates([
      observation(),
      observation({ recordId: 'record-2', tokensIn: 5 }),
      observation({ recordId: 'record-3', sessionId: 'session-2', tokensOut: 2 }),
    ])).toEqual([{
      tool: 'claude-code',
      model: 'claude-opus-4-1',
      day: '2026-08-22',
      sessions: 2,
      tokensIn: 25,
      tokensOut: 42,
      cacheRead: 90,
      cacheWrite: 120,
      costUsd: 3.75,
    }])
  })

  it('deduplicates repeated source records before summing', () => {
    expect(mergeAggregates([observation(), observation()])[0]).toMatchObject({
      sessions: 1, tokensIn: 10, costUsd: 1.25,
    })
  })

  it('returns deterministic row ordering', () => {
    const rows = mergeAggregates([
      observation({ recordId: '3', tool: 'opencode', model: 'zeta', day: '2026-08-21' }),
      observation({ recordId: '2', tool: 'codex-cli', model: 'alpha', day: '2026-08-22' }),
      observation({ recordId: '1', tool: 'claude-code', model: 'beta', day: '2026-08-22' }),
    ])
    expect(rows.map(({ tool, model, day }) => `${day}/${tool}/${model}`)).toEqual([
      '2026-08-21/opencode/zeta',
      '2026-08-22/claude-code/beta',
      '2026-08-22/codex-cli/alpha',
    ])
  })

  it.each([
    ['negative', { tokensIn: -1 }],
    ['non-finite', { costUsd: Number.POSITIVE_INFINITY }],
    ['unsafe integer', { cacheRead: Number.MAX_SAFE_INTEGER + 1 }],
  ])('rejects %s numeric values', (_name, overrides) => {
    expect(() => mergeAggregates([observation(overrides as Partial<UsageObservation>)]))
      .toThrow('invalid usage observation')
  })
})

describe('serializeReportRows', () => {
  it('copies exactly the approved outbound aggregate keys', () => {
    const [row] = serializeReportRows(mergeAggregates([observation()]))
    expect(Object.keys(row).sort()).toEqual([
      'cacheRead', 'cacheWrite', 'costUsd', 'day', 'model',
      'sessions', 'tokensIn', 'tokensOut', 'tool',
    ])
    expect(JSON.stringify(row)).not.toContain('recordId')
    expect(JSON.stringify(row)).not.toContain('sessionId')
  })
})
