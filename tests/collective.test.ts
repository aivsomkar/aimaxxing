import { describe, it, expect } from 'vitest'
import { collectiveTotals, shareByModel } from '../src/lib/collective'

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
})
