import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { JoinCtaContent } from '../src/components/JoinCta'

// The homepage shipped with no invitation at all: the only route in was a
// "Sign in" link in the nav that renders after the session resolves, so a
// logged-out visitor (and every crawler) saw a leaderboard with no way to join.
describe('JoinCta', () => {
  beforeAll(() => vi.stubGlobal('React', React))

  it('gives a logged-out visitor a route into the product', () => {
    const html = renderToStaticMarkup(<JoinCtaContent />)
    expect(html).toContain('href="/signin"')
    expect(html).toContain('Add your stack')
  })

  it('spells out all three steps, since none of them is obvious', () => {
    const html = renderToStaticMarkup(<JoinCtaContent />)
    expect(html).toContain('Sign in with GitHub')
    expect(html).toContain('Link your usage')
    expect(html).toContain('Publish when ready')
  })

  it('names the actual reporter command', () => {
    expect(renderToStaticMarkup(<JoinCtaContent />)).toContain('npx aimaxxing@latest link')
  })

  it('promises up front that signing in does not publish anything', () => {
    expect(renderToStaticMarkup(<JoinCtaContent />)).toContain('does not publish')
  })
})
