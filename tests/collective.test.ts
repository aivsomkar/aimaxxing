import { describe, it, expect } from 'vitest'
import { collectiveTotals, shareByModel, shareByTool } from '../src/lib/collective'

const row = (o: Partial<any> = {}) => ({
  tool: 'claude-code', model: 'opus', costUsd: 10,
  tokensIn: 1000, tokensOut: 500, cacheRead: 200, cacheWrite: 100,
  sponsored: false, verified: true, ...o,
})

describe('collectiveTotals', () => {
  it('sums cost and every token class', () => {
    const r = collectiveTotals([row(), row()])
    expect(r.costUsd).toBe(20)
    expect(r.tokensTotal).toBe(3600)
  })

  it('excludes sponsored credit spend from the headline total', () => {
    const r = collectiveTotals([row(), row({ sponsored: true, costUsd: 999 })])
    expect(r.costUsd).toBe(10)
  })
})

describe('shareByModel', () => {
  it('excludes self-reported rows so the data asset stays trustworthy', () => {
    const rows = [
      row({ model: 'opus', costUsd: 10, verified: true }),
      row({ model: 'gpt-5', costUsd: 90, verified: false }),
    ]
    const shares = shareByModel(rows)
    expect(shares).toHaveLength(1)
    expect(shares[0].model).toBe('opus')
    expect(shares[0].share).toBeCloseTo(1, 5)
  })

  it('returns shares that sum to one', () => {
    const rows = [row({ model: 'opus', costUsd: 25 }), row({ model: 'sonnet', costUsd: 75 })]
    const total = shareByModel(rows).reduce((a, s) => a + s.share, 0)
    expect(total).toBeCloseTo(1, 5)
  })

  it('returns an empty array rather than dividing by zero', () => {
    expect(shareByModel([])).toEqual([])
  })

  // The guard protects a real case: verified rows that all cost nothing.
  // Without it these produce NaN shares, which would render in the homepage chart.
  it('returns an empty array when every verified row has zero cost', () => {
    expect(shareByModel([row({ costUsd: 0 }), row({ costUsd: 0 })])).toEqual([])
  })
})

describe('shareByModel placeholder filtering', () => {
  it('omits bracketed placeholder models from the public breakdown', () => {
    const shares = shareByModel([
      row({ model: 'opus', costUsd: 90 }),
      row({ model: '<synthetic>', costUsd: 10 }),
    ])
    expect(shares.map((s) => s.model)).toEqual(['opus'])
    // Shares renormalise over real models only, so they still sum to one.
    expect(shares.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1, 5)
  })

  it('still counts placeholder spend in the collective total', () => {
    const rows = [row({ model: 'opus', costUsd: 90 }), row({ model: '<synthetic>', costUsd: 10 })]
    expect(collectiveTotals(rows).costUsd).toBe(100)
  })

  it('does not filter ordinary model names that merely contain angle-ish text', () => {
    const shares = shareByModel([row({ model: 'gpt-5.6-sol', costUsd: 10 })])
    expect(shares.map((s) => s.model)).toEqual(['gpt-5.6-sol'])
  })
})

describe('shareByTool', () => {
  it('excludes self-reported rows, same as shareByModel', () => {
    const rows = [
      row({ tool: 'claude-code', costUsd: 10, verified: true }),
      row({ tool: 'opencode', costUsd: 90, verified: false }),
    ]
    const shares = shareByTool(rows)
    expect(shares).toHaveLength(1)
    expect(shares[0].tool).toBe('claude-code')
    expect(shares[0].share).toBeCloseTo(1, 5)
  })

  it('excludes sponsored rows and keys on tool rather than model', () => {
    const rows = [
      row({ tool: 'aider', model: 'opus', costUsd: 40 }),
      row({ tool: 'codex-cli', model: 'opus', costUsd: 60 }),
      row({ tool: 'cursor', model: 'opus', costUsd: 999, sponsored: true }),
    ]
    const shares = shareByTool(rows)
    expect(shares.map((s) => s.tool)).toEqual(['codex-cli', 'aider'])
    expect(shares.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1, 5)
  })
})
