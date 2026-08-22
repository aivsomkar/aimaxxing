import { describe, expect, it } from 'vitest'
import { estimateCost, PRICING_VERSION } from '../src/pricing'

const usage = {
  model: 'openai/gpt-5.6-sol',
  tokensIn: 1_000_000,
  tokensOut: 1_000_000,
  cacheRead: 1_000_000,
  cacheWrite: 1_000_000,
}

describe('estimateCost', () => {
  it('applies the versioned input, output, cache-read, and cache-write rates', () => {
    expect(estimateCost(usage)).toEqual({ costUsd: 41.75, warning: null })
  })

  it('uses a trusted explicit source cost before model estimation', () => {
    expect(estimateCost({ ...usage, explicitCost: 7.123456 })).toEqual({
      costUsd: 7.1235, warning: null,
    })
  })

  it('keeps unknown-model tokens but reports zero estimated cost', () => {
    expect(estimateCost({ ...usage, model: 'unknown/new-model' })).toEqual({
      costUsd: 0, warning: 'unknown_price',
    })
  })

  it('rounds estimates deterministically to four decimal places', () => {
    expect(estimateCost({ ...usage, tokensIn: 123, tokensOut: 456, cacheRead: 0, cacheWrite: 0 }))
      .toEqual({ costUsd: 0.0143, warning: null })
  })
})

describe('PRICING_VERSION', () => {
  it('is a non-empty date-based version', () => {
    expect(PRICING_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
