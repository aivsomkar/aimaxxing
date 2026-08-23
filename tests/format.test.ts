import { describe, it, expect } from 'vitest'
import { formatUsd, formatCount, formatScore } from '../src/lib/format'

// These pin the LOCALE, not just the shape. With a bare toLocaleString() the
// collective counter rendered "5,52,87,88,163" for an en-IN viewer and
// "5,528,788,163" for an en-US one — the site's headline number changing shape
// per visitor. Everyone must see the same string.
describe('locale-pinned formatting', () => {
  it('groups large token counts in thousands, not lakh/crore', () => {
    expect(formatCount(5_528_788_163)).toBe('5,528,788,163')
  })

  it('groups large dollar amounts in thousands', () => {
    expect(formatUsd(1_234_567.891)).toBe('1,234,567.89')
  })

  it('does not depend on the ambient locale', () => {
    const original = process.env.LANG
    process.env.LANG = 'en_IN.UTF-8'
    try {
      expect(formatCount(5_528_788_163)).toBe('5,528,788,163')
      expect(formatUsd(1_234_567.891)).toBe('1,234,567.89')
    } finally {
      if (original === undefined) delete process.env.LANG
      else process.env.LANG = original
    }
  })

  it('always shows two decimals for money and one for scores', () => {
    expect(formatUsd(5)).toBe('5.00')
    expect(formatScore(39.7)).toBe('39.7')
    expect(formatScore(40)).toBe('40.0')
  })

  it('rounds counts rather than printing fractions', () => {
    expect(formatCount(1234.6)).toBe('1,235')
  })
})
