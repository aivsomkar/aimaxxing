import { describe, it, expect } from 'vitest'
import { deriveHandle } from '../src/lib/handle'

describe('deriveHandle', () => {
  it('lowercases and strips characters that are not url safe', () => {
    expect(deriveHandle('Omkar.Dev_1', new Set())).toBe('omkar-dev_1')
  })
  it('suffixes on collision rather than overwriting an existing handle', () => {
    expect(deriveHandle('omkar', new Set(['omkar']))).toBe('omkar-2')
    expect(deriveHandle('omkar', new Set(['omkar', 'omkar-2']))).toBe('omkar-3')
  })
  it('falls back for a login that reduces to nothing', () => {
    expect(deriveHandle('!!!', new Set())).toMatch(/^dev-/)
  })
  it.each(['methodology', 'settings', 'report', 'signin', 'sponsor', 'api', 'link'])(
    'never assigns the reserved product route %s',
    (segment) => {
      expect(deriveHandle(segment, new Set())).toBe(`${segment}-2`)
    },
  )
})
