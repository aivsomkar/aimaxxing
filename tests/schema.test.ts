// tests/schema.test.ts
import { describe, it, expect } from 'vitest'
import { getTableConfig } from 'drizzle-orm/pg-core'
import {
  users,
  toolDays,
  collectiveDays,
  portfolioProjects,
  portfolioImportSessions,
  reporters,
  reporterLinkSessions,
  reporterSubmissions,
  reporterActionRequests,
  reporterToolDays,
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

  it('stores reporter links, devices, submissions, actions, and verified daily rows', () => {
    expect(reporters.publicKey.notNull).toBe(true)
    expect(reporters.machineLabel.notNull).toBe(true)
    expect(reporterLinkSessions.deviceCodeHash.notNull).toBe(true)
    expect(reporterLinkSessions.expiresAt.notNull).toBe(true)
    expect(reporterSubmissions.payloadHash.notNull).toBe(true)
    expect(reporterActionRequests.requestId.notNull).toBe(true)
    expect(reporterToolDays.reporterId.notNull).toBe(true)
    expect(reporterToolDays.userId.notNull).toBe(true)
  })

  it('keeps reporter daily rows distinct per machine without changing manual uniqueness', () => {
    const reporterUniques = getTableConfig(reporterToolDays).indexes.filter((index) => index.config.unique)
    expect(reporterUniques.map((index) => index.config.columns.map((column: any) => column.name)))
      .toContainEqual(['reporter_id', 'tool', 'model', 'day'])

    const manualUniques = getTableConfig(toolDays).indexes.filter((index) => index.config.unique)
    expect(manualUniques[0].config.columns.map((column: any) => column.name))
      .toEqual(['user_id', 'tool', 'model', 'day'])
  })

  it('replay-protects reporter actions per reporter and cascades reporter-owned rows', () => {
    const actionUniques = getTableConfig(reporterActionRequests).indexes
      .filter((index) => index.config.unique)
    expect(actionUniques.map((index) => index.config.columns.map((column: any) => column.name)))
      .toContainEqual(['reporter_id', 'request_id'])

    const reporterForeignKey = getTableConfig(reporterToolDays).foreignKeys
      .find((foreignKey) => foreignKey.reference().columns[0].name === 'reporter_id')
    expect(reporterForeignKey?.onDelete).toBe('cascade')
  })
})
