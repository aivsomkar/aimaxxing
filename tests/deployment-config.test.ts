import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('Vercel deployment configuration', () => {
  it('runs database-backed functions in the same Singapore region as Neon', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
      regions?: string[]
    }
    expect(config.regions).toEqual(['sin1'])
  })
})
