import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { existsSync, readFileSync } from 'node:fs'

const migrationPath = 'drizzle/0003_fix_usage_accounting.sql'
let client: PGlite

function sql(path: string): string {
  return readFileSync(path, 'utf8').replaceAll('--> statement-breakpoint', '')
}

beforeAll(async () => {
  client = new PGlite()
  for (const path of [
    'drizzle/0000_overjoyed_ogun.sql',
    'drizzle/0001_perfect_mariko_yashida.sql',
    'drizzle/0002_perfect_chat.sql',
  ]) await client.exec(sql(path))
})

afterAll(async () => client.close())

describe('usage accounting data migration', () => {
  it('normalizes legacy Codex cache subsets and reprices every supported reporter model', async () => {
    await client.exec(`
      insert into users (id, github_id, handle) values (1, 'migration-user', 'migration-user');
      insert into reporters (
        id, user_id, machine_id_hash, machine_label, public_key, public_key_fingerprint
      ) values (
        '00000000-0000-4000-8000-000000000001', 1, 'machine', 'Machine', 'key', 'fingerprint'
      );
      insert into reporter_tool_days (
        reporter_id, user_id, tool, model, day, sessions,
        tokens_in, tokens_out, cache_read, cache_write, cost_usd
      ) values
        ('00000000-0000-4000-8000-000000000001', 1, 'codex-cli', 'gpt-5.6-sol', '2026-08-23', 1,
         10000000, 1000000, 3000000, 2000000, 999),
        ('00000000-0000-4000-8000-000000000001', 1, 'claude-code', 'claude-opus-5', '2026-08-23', 1,
         1000000, 1000000, 1000000, 1000000, 0),
        ('00000000-0000-4000-8000-000000000001', 1, 'opencode', 'vendor/private-model', '2026-08-23', 1,
         1000000, 1000000, 0, 0, 12.34);
    `)

    if (existsSync(migrationPath)) await client.exec(sql(migrationPath))

    const result = await client.query<{
      model: string
      tokens_in: number
      cost_usd: string
    }>(`select model, tokens_in, cost_usd from reporter_tool_days order by model`)
    expect(result.rows).toEqual([
      { model: 'claude-opus-5', tokens_in: 1_000_000, cost_usd: '36.7500' },
      { model: 'gpt-5.6-sol', tokens_in: 5_000_000, cost_usd: '69.0000' },
      { model: 'vendor/private-model', tokens_in: 1_000_000, cost_usd: '12.3400' },
    ])
  })
})
