import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// The deployed policy must never allow eval. Development needs it because
// Next's HMR is eval-based, and without it client components hydrate silently
// dead — tabs render but do not switch, and only a console CSP violation says why.
describe('Content-Security-Policy', () => {
  const source = readFileSync('next.config.ts', 'utf8')

  it('allows unsafe-eval only under a development guard', () => {
    expect(source).toContain("'unsafe-eval'")
    expect(source).toContain("process.env.NODE_ENV === 'development'")
  })

  it('never puts unsafe-eval in an unguarded script-src', () => {
    const unguarded = source
      .split('\n')
      .filter((l) => l.includes('script-src') && l.includes('unsafe-eval'))
      .filter((l) => !l.includes('?') && !l.includes(':'))
    expect(unguarded).toEqual([])
  })

  it('keeps the rest of the policy locked down', () => {
    for (const directive of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'"]) {
      expect(source).toContain(directive)
    }
  })
})
