import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { CodexCliAdapter } from '../src/adapters/codex-cli'
import { serializeReportRows } from '../src/report'

const root = fileURLToPath(new URL('./fixtures/codex-cli', import.meta.url))

describe('CodexCliAdapter', () => {
  it('uses one greatest cumulative token snapshot per session', async () => {
    const result = await new CodexCliAdapter(root).scan()
    expect(result.filesRead).toBe(2)
    expect(result.recordsRead).toBe(8)
    expect(result.rows).toEqual([
      {
        tool: 'codex-cli', model: 'gpt-5.1', day: '2026-08-21', sessions: 1,
        tokensIn: 150, tokensOut: 50, cacheRead: 30, cacheWrite: 7, costUsd: 0,
      },
      {
        tool: 'codex-cli', model: 'gpt-5-mini', day: '2026-08-22', sessions: 1,
        tokensIn: 10, tokensOut: 5, cacheRead: 2, cacheWrite: 1, costUsd: 0,
      },
    ])
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ adapter: 'codex-cli', code: 'invalid_json' }),
    ]))
  })

  it('never serializes content, tools, paths, repository metadata, or reasoning', async () => {
    const payload = JSON.stringify(serializeReportRows((await new CodexCliAdapter(root).scan()).rows))
    expect(payload).not.toContain('FORBIDDEN')
  })
})
