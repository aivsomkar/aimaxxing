import { describe, expect, it } from 'vitest'
import { normalizeDatabaseUrl } from '../src/lib/database-url'

describe('normalizeDatabaseUrl', () => {
  it('upgrades sslmode=require to certificate verification', () => {
    expect(normalizeDatabaseUrl('postgresql://user:pass@db.example/app?sslmode=require'))
      .toBe('postgresql://user:pass@db.example/app?sslmode=verify-full')
  })

  it('keeps verify-full and unrelated query parameters', () => {
    expect(normalizeDatabaseUrl('postgresql://db.example/app?pool=5&sslmode=verify-full&application_name=aimaxxing'))
      .toBe('postgresql://db.example/app?pool=5&sslmode=verify-full&application_name=aimaxxing')
  })

  it('leaves local PGlite URLs untouched', () => {
    expect(normalizeDatabaseUrl('pglite://.data/pg')).toBe('pglite://.data/pg')
  })
})
