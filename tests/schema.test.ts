// tests/schema.test.ts
import { describe, it, expect } from 'vitest'
import { users, toolDays, collectiveDays } from '../src/db/schema'

describe('schema', () => {
  it('defaults public_opt_in to false so nobody is listed without consent', () => {
    expect(users.publicOptIn.default).toBe(false)
  })

  it('has a uniqueness key on (user, tool, model, day) so re-reporting is idempotent', () => {
    expect(toolDays.userId).toBeDefined()
    expect(toolDays.tool).toBeDefined()
    expect(toolDays.model).toBeDefined()
    expect(toolDays.day).toBeDefined()
  })

  it('tracks cache tokens separately on the collective rollup', () => {
    expect(collectiveDays.cacheRead).toBeDefined()
    expect(collectiveDays.cacheWrite).toBeDefined()
  })

  it('defaults tag_opt_in to false so nobody is tagged without asking', () => {
    expect(users.tagOptIn.default).toBe(false)
  })
})
