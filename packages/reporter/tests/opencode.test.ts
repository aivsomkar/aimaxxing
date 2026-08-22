import { afterEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { OpenCodeAdapter } from '../src/adapters/opencode'
import { serializeReportRows } from '../src/report'

const temporary: string[] = []

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

async function databasePath(schema = `
  create table session (
    id text not null,
    model text not null,
    cost real not null,
    tokens_input integer not null,
    tokens_output integer not null,
    tokens_reasoning integer not null,
    tokens_cache_read integer not null,
    tokens_cache_write integer not null,
    time_created integer not null,
    directory text,
    title text
  )
`): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'aimaxxing-opencode-'))
  temporary.push(root)
  const path = join(root, 'opencode.db')
  const database = new DatabaseSync(path)
  database.exec(schema)
  database.close()
  return path
}

describe('OpenCodeAdapter', () => {
  it('selects only supported aggregate columns from the session table', async () => {
    const path = await databasePath()
    const database = new DatabaseSync(path)
    database.prepare(`
      insert into session values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'session-1', JSON.stringify({ providerID: 'anthropic', modelID: 'claude-sonnet-4' }),
      1.2345, 100, 20, 5, 30, 10, Date.parse('2026-08-22T01:00:00Z'),
      '/FORBIDDEN_OPENCODE_PATH', 'FORBIDDEN_OPENCODE_TITLE',
    )
    database.prepare(`
      insert into session values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'session-2', JSON.stringify({ providerID: 'anthropic', modelID: 'claude-sonnet-4' }),
      0.5001, 10, 4, 1, 3, 2, Date.parse('2026-08-22T02:00:00Z'),
      '/FORBIDDEN_SECOND_PATH', 'FORBIDDEN_SECOND_TITLE',
    )
    database.exec('create table message (id text, content text)')
    database.prepare('insert into message values (?, ?)').run('message-1', 'FORBIDDEN_MESSAGE_CONTENT')
    database.close()

    const result = await new OpenCodeAdapter(path).scan()
    expect(result).toMatchObject({ filesRead: 1, recordsRead: 2, warnings: [] })
    expect(result.rows).toEqual([{
      tool: 'opencode', model: 'anthropic/claude-sonnet-4', day: '2026-08-22', sessions: 2,
      tokensIn: 110, tokensOut: 30, cacheRead: 33, cacheWrite: 12, costUsd: 1.7346,
    }])
    expect(JSON.stringify(serializeReportRows(result.rows))).not.toContain('FORBIDDEN')
  })

  it('returns not_found when the OpenCode store does not exist', async () => {
    const result = await new OpenCodeAdapter('/definitely/not/an/opencode.db').scan()
    expect(result).toMatchObject({
      rows: [], filesRead: 0,
      warnings: [expect.objectContaining({ code: 'not_found' })],
    })
  })

  it('returns unsupported_format when a required session column is missing', async () => {
    const path = await databasePath('create table session (id text, model text)')
    const result = await new OpenCodeAdapter(path).scan()
    expect(result).toMatchObject({
      rows: [], filesRead: 1,
      warnings: [expect.objectContaining({ code: 'unsupported_format' })],
    })
  })
})
