import { homedir } from 'node:os'
import { join } from 'node:path'
import { mergeAggregates } from '../report.js'
import { counter, findJsonlFiles, identifier, object, pathExists, readJsonLines, utcDay } from './jsonl.js'
import type { ScanResult, UsageAdapter, UsageObservation } from './types.js'

type TokenSnapshot = {
  day: string
  tokensIn: number
  tokensOut: number
  cacheRead: number
  cacheWrite: number
  total: number
}

export class CodexCliAdapter implements UsageAdapter {
  readonly id = 'codex-cli' as const

  constructor(private readonly root = join(homedir(), '.codex', 'sessions')) {}

  detect(): Promise<boolean> {
    return pathExists(this.root)
  }

  async scan(): Promise<ScanResult> {
    const files = await findJsonlFiles(this.root)
    if (files.length === 0) {
      return {
        rows: [], filesRead: 0, recordsRead: 0,
        warnings: [{ adapter: this.id, code: 'not_found', message: 'Codex CLI usage was not found.' }],
      }
    }
    const observations: UsageObservation[] = []
    const warnings: ScanResult['warnings'] = []
    let recordsRead = 0
    for (const file of files) {
      let sessionId: string | null = null
      let model: string | null = null
      let sessionDay: string | null = null
      let best: TokenSnapshot | null = null
      const result = await readJsonLines(file, this.id, (value) => {
        const row = object(value)
        const payload = object(row?.payload)
        if (!row || !payload) return
        if (row.type === 'session_meta') {
          sessionId = identifier(payload.id) ?? sessionId
          model = identifier(payload.model) ?? model
          sessionDay = utcDay(row.timestamp) ?? sessionDay
          return
        }
        if (row.type === 'turn_context') {
          model = identifier(payload.model) ?? model
          return
        }
        const info = object(payload.info)
        const usage = object(info?.total_token_usage)
        if (!usage) return
        const snapshot = this.snapshot(usage, utcDay(row.timestamp) ?? sessionDay)
        if (snapshot && (!best || snapshot.total > best.total)) best = snapshot
      })
      recordsRead += result.recordsRead
      warnings.push(...result.warnings)
      const selected = best as TokenSnapshot | null
      if (sessionId && model && selected) {
        observations.push({
          recordId: `session:${sessionId}`,
          sessionId,
          tool: this.id,
          model,
          day: selected.day,
          tokensIn: selected.tokensIn,
          tokensOut: selected.tokensOut,
          cacheRead: selected.cacheRead,
          cacheWrite: selected.cacheWrite,
          costUsd: 0,
        })
      }
    }
    return {
      rows: mergeAggregates(observations),
      filesRead: files.length,
      recordsRead,
      warnings,
    }
  }

  private snapshot(usage: Record<string, unknown>, day: string | null): TokenSnapshot | null {
    if (!day) return null
    const tokensIn = counter(usage.input_tokens)
    const tokensOut = counter(usage.output_tokens)
    const cacheRead = counter(usage.cached_input_tokens)
    const cacheWrite = counter(usage.cache_write_input_tokens)
    if (tokensIn === null || tokensOut === null || cacheRead === null || cacheWrite === null) return null
    return {
      day,
      tokensIn,
      tokensOut,
      cacheRead,
      cacheWrite,
      total: tokensIn + tokensOut + cacheRead + cacheWrite,
    }
  }
}
