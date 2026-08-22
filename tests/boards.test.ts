import { describe, it, expect } from 'vitest'
import { rankBoard } from '../src/lib/boards'

const e = (handle: string, o: Partial<any> = {}) => ({
  handle, avatarUrl: null,
  tools: [{ tool: 'claude-code', sessions: 100, costUsd: 50 }],
  costUsd: 50, mergedPrs: 0, contributions: 0, anyUnverified: false, ...o,
})

describe('rankBoard', () => {
  it('ranks the burn board by spend, descending', () => {
    const r = rankBoard('burn', [e('a', { costUsd: 10 }), e('b', { costUsd: 90 })])
    expect(r.map(x => x.handle)).toEqual(['b', 'a'])
    expect(r[0].value).toBe(90)
  })

  it('ranks breadth by count of qualifying tools only', () => {
    const wide = e('wide', { tools: [
      { tool: 'a', sessions: 30, costUsd: 0 },
      { tool: 'b', sessions: 30, costUsd: 0 },
      { tool: 'c', sessions: 2, costUsd: 0 },   // below floor, must not count
    ]})
    const r = rankBoard('breadth', [wide])
    expect(r[0].value).toBe(2)
  })

  it('ranks efficiency as spend per merged PR, ascending, skipping zero-PR entrants', () => {
    const good = e('good', { costUsd: 100, mergedPrs: 10 })   // $10/PR
    const bad  = e('bad',  { costUsd: 100, mergedPrs: 2  })   // $50/PR
    const none = e('none', { costUsd: 100, mergedPrs: 0  })
    const r = rankBoard('efficiency', [bad, good, none])
    expect(r.map(x => x.handle)).toEqual(['good', 'bad'])
    expect(r[0].value).toBeCloseTo(10, 5)
  })

  it('sorts self-reported below verified at equal value', () => {
    const v = e('verified', { costUsd: 50, anyUnverified: false })
    const s = e('selfrep',  { costUsd: 50, anyUnverified: true })
    const r = rankBoard('burn', [s, v])
    expect(r.map(x => x.handle)).toEqual(['verified', 'selfrep'])
  })

  it('ranks the index board using the published formula', () => {
    const poly = e('poly', { tools: Array.from({length:4},(_,i)=>({tool:`t${i}`,sessions:100,costUsd:0})) })
    const spec = e('spec', { tools: [{ tool: 'a', sessions: 400, costUsd: 0 }] })
    const r = rankBoard('index', [spec, poly])
    expect(r.map(x => x.handle)).toEqual(['poly', 'spec'])
    expect(r[0].value).toBeCloseTo(40, 5)
  })

  it('index includes outputTerm from mergedPrs in the formula', () => {
    // stackDepth only: sqrt(100) = 10
    // with 1 mergedPr: outputTerm = 2 * sqrt(1) = 2
    // full index = 10 + 2 = 12
    const with_output = e('with_output', { tools: [{ tool: 'a', sessions: 100, costUsd: 0 }], mergedPrs: 1 })
    const without_output = e('without_output', { tools: [{ tool: 'a', sessions: 100, costUsd: 0 }], mergedPrs: 0 })
    const r = rankBoard('index', [without_output, with_output])
    expect(r.map(x => x.handle)).toEqual(['with_output', 'without_output'])
    expect(r[0].value).toBeCloseTo(12, 5)
    expect(r[1].value).toBeCloseTo(10, 5)
  })
})
