import { describe, it, expect } from 'vitest'
import { collectiveTotals, shareByModel, shareByTool, OTHER_LABEL } from '../src/lib/collective'

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

describe('long-tail collapse', () => {
  it('folds every sub-1% model into a single "other" bucket, sorted last', () => {
    const shares = shareByModel([
      row({ model: 'opus', costUsd: 500 }),
      row({ model: 'sonnet', costUsd: 480 }),
      row({ model: 'tiny-a', costUsd: 8 }),
      row({ model: 'tiny-b', costUsd: 7 }),
      row({ model: 'tiny-c', costUsd: 5 }),
    ])
    expect(shares.map((s) => s.model)).toEqual(['opus', 'sonnet', OTHER_LABEL])
    const other = shares.at(-1)!
    expect(other.costUsd).toBeCloseTo(20, 5)
    expect(other.share).toBeCloseTo(0.02, 5)
  })

  it('still sums to one after collapsing', () => {
    const shares = shareByModel([
      row({ model: 'opus', costUsd: 990 }),
      row({ model: 'tiny-a', costUsd: 5 }),
      row({ model: 'tiny-b', costUsd: 5 }),
    ])
    expect(shares.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1, 10)
  })

  it('leaves a lone sub-1% entry named, since collapsing it saves no row', () => {
    const shares = shareByModel([
      row({ model: 'opus', costUsd: 995 }),
      row({ model: 'gpt-5.6-terra', costUsd: 5 }),
    ])
    expect(shares.map((s) => s.model)).toEqual(['opus', 'gpt-5.6-terra'])
    expect(shares.map((s) => s.model)).not.toContain(OTHER_LABEL)
  })

  it('does not collapse anything when every share clears the threshold', () => {
    const shares = shareByModel([
      row({ model: 'opus', costUsd: 60 }),
      row({ model: 'sonnet', costUsd: 40 }),
    ])
    expect(shares.map((s) => s.model)).toEqual(['opus', 'sonnet'])
  })

  it('applies the same collapse to the tool breakdown', () => {
    const shares = shareByTool([
      row({ tool: 'claude-code', costUsd: 500 }),
      row({ tool: 'opencode', costUsd: 480 }),
      row({ tool: 'tiny-a', costUsd: 5 }),
      row({ tool: 'tiny-b', costUsd: 5 }),
    ])
    expect(shares.map((s) => s.tool)).toEqual(['claude-code', 'opencode', OTHER_LABEL])
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
