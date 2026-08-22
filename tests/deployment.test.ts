import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Vercel deployment contract', () => {
  it('applies committed database migrations before building server code', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
      buildCommand?: string
    }
    expect(config.buildCommand).toBe('pnpm db:migrate && pnpm build')
  })
})
