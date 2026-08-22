import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { ClaudeCodeAdapter } from '../src/adapters/claude-code'
import { serializeReportRows } from '../src/report'

const root = fileURLToPath(new URL('./fixtures/claude-code', import.meta.url))

describe('ClaudeCodeAdapter', () => {
  it('streams assistant usage, deduplicates messages, and counts distinct sessions', async () => {
    const result = await new ClaudeCodeAdapter(root).scan()
    expect(result.filesRead).toBe(2)
    expect(result.recordsRead).toBe(6)
    expect(result.rows).toEqual([
      {
        tool: 'claude-code', model: 'claude-opus-4-1', day: '2026-08-21', sessions: 1,
        tokensIn: 120, tokensOut: 65, cacheRead: 30, cacheWrite: 12, costUsd: 0,
      },
      {
        tool: 'claude-code', model: 'claude-sonnet-4', day: '2026-08-22', sessions: 1,
        tokensIn: 40, tokensOut: 30, cacheRead: 0, cacheWrite: 4, costUsd: 0,
      },
    ])
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ adapter: 'claude-code', code: 'invalid_json' }),
    ]))
  })

  it('never serializes content, paths, Git data, or raw invalid records', async () => {
    const payload = JSON.stringify(serializeReportRows((await new ClaudeCodeAdapter(root).scan()).rows))
    expect(payload).not.toContain('FORBIDDEN')
    expect(payload).not.toContain('SECRET_REPOSITORY_PATH')
  })
})
