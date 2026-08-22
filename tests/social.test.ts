import { describe, expect, it } from 'vitest'
import { normalizeXHandle, validateXHandle, xProfileUrl } from '../src/lib/social'

describe('normalizeXHandle', () => {
  it.each([
    ['omkar', '@omkar'],
    [' @Omkar_AI ', '@Omkar_AI'],
    ['https://x.com/omkar', '@omkar'],
    ['https://twitter.com/omkar/', '@omkar'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeXHandle(input)).toBe(expected)
  })

  it.each(['name-with-dash', '@', 'a'.repeat(16), 'https://example.com/omkar'])
    ('rejects %s', (input) => {
      expect(normalizeXHandle(input)).toBeNull()
    })

  it.each([
    'https://x.com/search?q=codex',
    'https://twitter.com/settings',
  ])('rejects the non-profile X route %s', (input) => {
    expect(normalizeXHandle(input)).toBeNull()
  })
})

describe('validateXHandle', () => {
  it('treats an empty value as clearing the public handle', () => {
    expect(validateXHandle('  ')).toEqual({ ok: true, value: null })
  })

  it('returns actionable validation copy for malformed input', () => {
    expect(validateXHandle('not-valid!')).toEqual({
      ok: false,
      error: 'Enter a valid X username using letters, numbers, or underscores.',
    })
  })
})

describe('xProfileUrl', () => {
  it('builds a safe profile URL from a normalized handle', () => {
    expect(xProfileUrl('@Omkar_AI')).toBe('https://x.com/Omkar_AI')
  })
})
