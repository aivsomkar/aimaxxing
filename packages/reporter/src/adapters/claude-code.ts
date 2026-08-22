import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { mergeAggregates } from '../report.js'
import { counter, findJsonlFiles, identifier, object, pathExists, readJsonLines, utcDay } from './jsonl.js'
import type { ScanResult, UsageAdapter, UsageObservation } from './types.js'

export class ClaudeCodeAdapter implements UsageAdapter {
  readonly id = 'claude-code' as const

  constructor(private readonly root = join(homedir(), '.claude', 'projects')) {}

  detect(): Promise<boolean> {
    return pathExists(this.root)
  }

  async scan(): Promise<ScanResult> {
    const files = await findJsonlFiles(this.root)
    if (files.length === 0) {
      return {
        rows: [], filesRead: 0, recordsRead: 0,
        warnings: [{ adapter: this.id, code: 'not_found', message: 'Claude Code usage was not found.' }],
      }
    }
    const observations: UsageObservation[] = []
    const warnings: ScanResult['warnings'] = []
    let recordsRead = 0
    for (const file of files) {
      const result = await readJsonLines(file, this.id, (record) => {
        const row = this.observation(record)
        if (row) observations.push(row)
      })
      recordsRead += result.recordsRead
      warnings.push(...result.warnings)
    }
    return {
      rows: mergeAggregates(observations),
      filesRead: files.length,
      recordsRead,
      warnings,
    }
  }

  private observation(value: unknown): UsageObservation | null {
    const row = object(value)
    if (!row || row.type !== 'assistant') return null
    const message = object(row.message)
    const usage = object(message?.usage)
    const sessionId = identifier(row.sessionId)
    const model = identifier(message?.model)
    const day = utcDay(row.timestamp)
    if (!message || !usage || !sessionId || !model || !day) return null

    const tokensIn = counter(usage.input_tokens)
    const tokensOut = counter(usage.output_tokens)
    const cacheRead = counter(usage.cache_read_input_tokens)
    const cacheWrite = counter(usage.cache_creation_input_tokens)
    if (tokensIn === null || tokensOut === null || cacheRead === null || cacheWrite === null) return null

    const messageId = identifier(message.id)
    const requestId = identifier(row.requestId)
    const recordId = messageId
      ? `${messageId}:${requestId ?? ''}`
      : createHash('sha256').update(JSON.stringify([
          sessionId, row.timestamp, model, tokensIn, tokensOut, cacheRead, cacheWrite,
        ])).digest('hex')

    return {
      recordId,
      sessionId,
      tool: this.id,
      model,
      day,
      tokensIn,
      tokensOut,
      cacheRead,
      cacheWrite,
      costUsd: 0,
    }
  }
}
