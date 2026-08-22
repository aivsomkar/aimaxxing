// tests/schema.test.ts
import { describe, it, expect } from 'vitest'
import { getTableConfig } from 'drizzle-orm/pg-core'
import {
  users,
  toolDays,
  collectiveDays,
  portfolioProjects,
  portfolioImportSessions,
} from '../src/db/schema'

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

  it('stores the GitHub login separately from the stable public handle', () => {
    expect(users.githubLogin.name).toBe('github_login')
  })

  it('prevents duplicate portfolio URLs and imported project IDs per user', () => {
    const uniques = getTableConfig(portfolioProjects).indexes.filter((i) => i.config.unique)
    expect(uniques.map((i) => i.config.columns.map((c: any) => c.name)))
      .toEqual(expect.arrayContaining([
        ['user_id', 'live_url'],
        ['user_id', 'source', 'external_id'],
      ]))
  })

  it('cascades portfolio projects and import sessions with their owner', () => {
    const projectForeignKeys = getTableConfig(portfolioProjects).foreignKeys
    const sessionForeignKeys = getTableConfig(portfolioImportSessions).foreignKeys
    expect(projectForeignKeys).toHaveLength(1)
    expect(sessionForeignKeys).toHaveLength(1)
    expect(projectForeignKeys[0].reference().foreignColumns[0].name).toBe('id')
    expect(sessionForeignKeys[0].reference().foreignColumns[0].name).toBe('id')
    expect(projectForeignKeys[0].onDelete).toBe('cascade')
    expect(sessionForeignKeys[0].onDelete).toBe('cascade')
  })

  it('stores private import candidates with an expiry', () => {
    expect(portfolioImportSessions.candidates.dataType).toBe('json')
    expect(portfolioImportSessions.expiresAt.notNull).toBe(true)
  })
})
