import { describe, it, expect } from 'vitest'
import { computeIndex, qualifies, toolScore, outputTerm, OUTPUT_CAP } from '../src/lib/index-math'

const t = (tool: string, sessions: number, costUsd = 0) => ({ tool, sessions, costUsd })

describe('qualifying floor', () => {
  it('rejects a tool below both thresholds', () => {
    expect(qualifies(t('aider', 5, 1))).toBe(false)
  })
  it('accepts on sessions alone', () => {
    expect(qualifies(t('aider', 20, 0))).toBe(true)
  })
  it('accepts on spend alone', () => {
    expect(qualifies(t('aider', 3, 5))).toBe(true)
  })
})

describe('toolScore', () => {
  it('is the square root of sessions', () => {
    expect(toolScore(t('claude-code', 400))).toBeCloseTo(20, 5)
  })
  it('ignores spend entirely so rank cannot be purchased', () => {
    expect(toolScore(t('a', 100, 0))).toBeCloseTo(toolScore(t('a', 100, 99999)), 5)
  })
})

describe('breadth beats equivalent depth', () => {
  const none = { mergedPrs: 0, contributions: 0 }
  it('ranks 4x100 above 1x400', () => {
    const polyglot = computeIndex([t('a',100),t('b',100),t('c',100),t('d',100)], none)
    const specialist = computeIndex([t('a',400)], none)
    expect(polyglot.stackDepth).toBeCloseTo(40, 5)
    expect(specialist.stackDepth).toBeCloseTo(20, 5)
    expect(polyglot.index).toBeGreaterThan(specialist.index)
  })
  it('scores a tourist at zero', () => {
    const tourist = computeIndex(
      Array.from({ length: 8 }, (_, i) => t(`tool${i}`, 5, 1)), none)
    expect(tourist.stackDepth).toBe(0)
  })
  it('ranks a deep specialist above a tourist', () => {
    const specialist = computeIndex([t('a',400)], none)
    const tourist = computeIndex(Array.from({length:8},(_,i)=>t(`x${i}`,5,1)), none)
    expect(specialist.index).toBeGreaterThan(tourist.index)
  })
})

describe('output term', () => {
  it('is additive and capped', () => {
    expect(outputTerm({ mergedPrs: 100000, contributions: 100000 })).toBe(OUTPUT_CAP)
  })
  it('does not zero out a developer with no public PRs', () => {
    const priv = computeIndex([t('a',100)], { mergedPrs: 0, contributions: 500 })
    expect(priv.index).toBeGreaterThan(10)
  })
  it('counts private contributions at a discount to merged PRs', () => {
    expect(outputTerm({ mergedPrs: 20, contributions: 0 }))
      .toBeGreaterThan(outputTerm({ mergedPrs: 0, contributions: 20 }))
  })
})

describe('reproducibility', () => {
  it('reports per-tool scores that sum to stackDepth', () => {
    const r = computeIndex([t('a',100),t('b',49),t('c',5,1)], { mergedPrs: 0, contributions: 0 })
    const sum = r.perTool.filter(p => p.qualified).reduce((a,p) => a + p.score, 0)
    expect(sum).toBeCloseTo(r.stackDepth, 10)
    expect(r.index).toBeCloseTo(r.stackDepth + r.outputTerm, 10)
  })
  // Must pin additivity where a multiplicative form would DIFFER. With outputTerm 0,
  // stackDepth*(1+term) equals stackDepth+term, so a zero-term case cannot catch it.
  it('combines stack depth and output additively when the output term is nonzero', () => {
    const r = computeIndex([t('a',100)], { mergedPrs: 20, contributions: 0 })
    expect(r.outputTerm).toBeGreaterThan(0)
    expect(r.index).toBeCloseTo(r.stackDepth + r.outputTerm, 10)
    expect(r.index).not.toBeCloseTo(r.stackDepth * (1 + r.outputTerm), 5)
  })
})

describe('negative input is clamped, not propagated', () => {
  it('scores a negative session count as zero rather than NaN', () => {
    expect(toolScore(t('a', -5))).toBe(0)
  })
  it('does not produce NaN from negative merged PRs', () => {
    const o = outputTerm({ mergedPrs: -10, contributions: 0 })
    expect(Number.isNaN(o)).toBe(false)
    expect(o).toBe(0)
  })
  it('does not produce NaN from negative contributions', () => {
    const o = outputTerm({ mergedPrs: 0, contributions: -100 })
    expect(Number.isNaN(o)).toBe(false)
    expect(o).toBe(0)
  })
})
