import { DatabaseSync } from 'node:sqlite'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { mergeAggregates } from '../report.js'
import { counter, identifier, object, pathExists } from './jsonl.js'
import type { ScanResult, UsageAdapter, UsageObservation } from './types.js'

const REQUIRED_COLUMNS = [
  'id',
  'model',
  'cost',
  'tokens_input',
  'tokens_output',
  'tokens_reasoning',
  'tokens_cache_read',
  'tokens_cache_write',
  'time_created',
] as const

const SESSION_SELECT = `
  select id, model, cost, tokens_input, tokens_output, tokens_reasoning,
    tokens_cache_read, tokens_cache_write, time_created
  from session
`

function defaultStore(): string {
  if (process.platform === 'win32') {
    const root = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
    return join(root, 'opencode', 'opencode.db')
  }
  return join(homedir(), '.local', 'share', 'opencode', 'opencode.db')
}

export class OpenCodeAdapter implements UsageAdapter {
  readonly id = 'opencode' as const

  constructor(private readonly store = defaultStore()) {}

  detect(): Promise<boolean> {
    return pathExists(this.store)
  }

  async scan(): Promise<ScanResult> {
    if (!await pathExists(this.store)) {
      return {
        rows: [], filesRead: 0, recordsRead: 0,
        warnings: [{ adapter: this.id, code: 'not_found', message: 'OpenCode usage was not found.' }],
      }
    }

    let database: DatabaseSync | null = null
    try {
      database = new DatabaseSync(this.store, { readOnly: true })
      const columns = database.prepare('pragma table_info(session)').all()
        .map((row) => identifier(object(row)?.name))
      if (!REQUIRED_COLUMNS.every((column) => columns.includes(column))) {
        return {
          rows: [], filesRead: 1, recordsRead: 0,
          warnings: [{
            adapter: this.id,
            code: 'unsupported_format',
            message: 'The OpenCode database format is not supported by this reporter version.',
          }],
        }
      }

      const sourceRows = database.prepare(SESSION_SELECT).all()
      const observations: UsageObservation[] = []
      const warnings: ScanResult['warnings'] = []
      for (const value of sourceRows) {
        const observation = this.observation(value)
        if (observation) observations.push(observation)
        else warnings.push({
          adapter: this.id,
          code: 'invalid_record',
          message: 'Skipped an invalid OpenCode aggregate record.',
        })
      }
      return {
        rows: mergeAggregates(observations),
        filesRead: 1,
        recordsRead: sourceRows.length,
        warnings,
      }
    } catch {
      return {
        rows: [], filesRead: 1, recordsRead: 0,
        warnings: [{
          adapter: this.id,
          code: 'unsupported_format',
          message: 'The OpenCode database could not be read safely.',
        }],
      }
    } finally {
      database?.close()
    }
  }

  private observation(value: unknown): UsageObservation | null {
    const row = object(value)
    if (!row) return null
    const sessionId = identifier(row.id)
    const model = this.model(row.model)
    const tokensIn = counter(row.tokens_input)
    const tokensOut = counter(row.tokens_output)
    const reasoning = counter(row.tokens_reasoning)
    const cacheRead = counter(row.tokens_cache_read)
    const cacheWrite = counter(row.tokens_cache_write)
    const day = this.day(row.time_created)
    const cost = typeof row.cost === 'number' && Number.isFinite(row.cost) && row.cost >= 0
      ? row.cost
      : null
    if (!sessionId || !model || tokensIn === null || tokensOut === null || reasoning === null
      || cacheRead === null || cacheWrite === null || !day || cost === null) return null
    if (!Number.isSafeInteger(tokensOut + reasoning)) return null
    return {
      recordId: `session:${sessionId}`,
      sessionId,
      tool: this.id,
      model,
      day,
      tokensIn,
      tokensOut: tokensOut + reasoning,
      cacheRead,
      cacheWrite,
      costUsd: cost,
    }
  }

  private model(value: unknown): string | null {
    if (typeof value !== 'string') return null
    try {
      const parsed = object(JSON.parse(value) as unknown)
      const provider = identifier(parsed?.providerID)
      const model = identifier(parsed?.modelID)
      return provider && model ? `${provider}/${model}` : null
    } catch {
      return null
    }
  }

  private day(value: unknown): string | null {
    const number = typeof value === 'bigint' ? Number(value) : value
    if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < 0) return null
    const milliseconds = number >= 1_000_000_000_000 ? number : number * 1000
    const date = new Date(milliseconds)
    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null
  }
}
