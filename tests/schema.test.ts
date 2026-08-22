// tests/schema.test.ts
import { describe, it, expect } from 'vitest'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { users, toolDays, collectiveDays } from '../src/db/schema'

describe('schema', () => {
  it('defaults public_opt_in to false so nobody is listed without consent', () => {
    expect(users.publicOptIn.default).toBe(false)
  })

  // Must fail if the uniqueIndex is removed: this index is the only mechanism
  // making re-reporting the same day idempotent, which the spec requires.
  it('has a uniqueness key on (user, tool, model, day) so re-reporting is idempotent', () => {
    const uniques = getTableConfig(toolDays).indexes.filter((i) => i.config.unique)
    expect(uniques).toHaveLength(1)
    expect(uniques[0].config.columns.map((c: any) => c.name).sort())
      .toEqual(['day', 'model', 'tool', 'user_id'])
  })

  it('tracks cache tokens separately on the collective rollup', () => {
    expect(collectiveDays.cacheRead).toBeDefined()
    expect(collectiveDays.cacheWrite).toBeDefined()
  })

  it('defaults tag_opt_in to false so nobody is tagged without asking', () => {
    expect(users.tagOptIn.default).toBe(false)
  })
})
