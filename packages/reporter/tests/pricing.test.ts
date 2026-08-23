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

  it('recognizes the unprefixed model IDs emitted by Claude Code and Codex CLI', () => {
    expect(estimateCost({ ...usage, model: 'gpt-5' }).warning).toBeNull()
    expect(estimateCost({ ...usage, model: 'claude-opus-4-1' }).warning).toBeNull()
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

  it.each([
    ['claude-fable-5', 73.5],
    ['claude-opus-5', 36.75],
    ['claude-opus-4-8', 36.75],
    ['claude-sonnet-5', 14.7],
    ['claude-sonnet-4-6', 22.05],
    ['claude-haiku-4-5-20251001', 7.35],
    ['gpt-5.5', 41.75],
  ])('prices current imported model %s instead of silently reporting $0', (model, costUsd) => {
    expect(estimateCost({ ...usage, model })).toEqual({ costUsd, warning: null })
  })
})

describe('PRICING_VERSION', () => {
  it('identifies the cache-normalized pricing contract', () => {
    expect(PRICING_VERSION).toBe('2026-08-23.1')
  })
})
