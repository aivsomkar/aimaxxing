import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { CollectiveCounter } from '../src/components/CollectiveCounter'
import { LiveStatBar } from '../src/components/LiveStatBar'
import { ModelSplit } from '../src/components/ModelSplit'

describe('CollectiveCounter', () => {
  beforeAll(() => vi.stubGlobal('React', React))

  it('renders exact stored values with an honest estimate basis and UTC-day window', () => {
    const html = renderToStaticMarkup(<CollectiveCounter initial={{
      costUsd: 1410.0274,
      tokensTotal: 5_862_483_267,
      todayCostUsd: 579.1951,
      developers: 1,
    }} />)

    expect(html).toContain('$1,410.03')
    expect(html).toContain('estimated API-equivalent value')
    expect(html).toContain('$579.20')
    expect(html).toContain('today UTC')
    expect(html).not.toContain('last 24h')
  })

  it('labels supporting cost displays as estimates rather than actual money burned', () => {
    const bar = renderToStaticMarkup(<LiveStatBar developers={1} tokensTotal={100} costUsd={12.34} />)
    const split = renderToStaticMarkup(<ModelSplit shares={[
      { model: 'gpt-5.6-sol', costUsd: 12.34, share: 1 },
    ]} />)

    expect(bar).toContain('est. API value')
    expect(bar).not.toContain('burned')
    expect(split).toContain('Where the estimated API value went')
  })

describe('singular/plural developer copy', () => {
  beforeAll(() => vi.stubGlobal('React', React))

  it('says "1 developer" not "1 developers" in the counter', () => {
    const html = renderToStaticMarkup(<CollectiveCounter initial={{
      costUsd: 10, tokensTotal: 100, todayCostUsd: 1, developers: 1,
    }} />)
    expect(html).toContain('developer')
    expect(html).not.toContain('developers')
  })

  it('pluralises the counter above one', () => {
    const html = renderToStaticMarkup(<CollectiveCounter initial={{
      costUsd: 10, tokensTotal: 100, todayCostUsd: 1, developers: 2,
    }} />)
    expect(html).toContain('developers')
  })

  it('says "1 developer" not "1 developers" in the live stat bar', () => {
    const html = renderToStaticMarkup(
      <LiveStatBar developers={1} tokensTotal={100} costUsd={10} />,
    )
    expect(html).toContain('developer')
    expect(html).not.toContain('developers')
  })

  it('pluralises the live stat bar above one', () => {
    const html = renderToStaticMarkup(
      <LiveStatBar developers={4} tokensTotal={100} costUsd={10} />,
    )
    expect(html).toContain('developers')
  })
})
})
