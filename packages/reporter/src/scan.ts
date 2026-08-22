import { ClaudeCodeAdapter } from './adapters/claude-code.js'
import { CodexCliAdapter } from './adapters/codex-cli.js'
import { OpenCodeAdapter } from './adapters/opencode.js'
import type { AdapterWarning, UsageAdapter, UsageAggregate } from './adapters/types.js'
import { estimateCost } from './pricing.js'
import { serializeReportRows } from './report.js'

export type CompletedScan = {
  rows: UsageAggregate[]
  filesRead: number
  recordsRead: number
  warnings: AdapterWarning[]
}

export async function scanUsage(
  adapters: UsageAdapter[] = [new ClaudeCodeAdapter(), new CodexCliAdapter(), new OpenCodeAdapter()],
): Promise<CompletedScan> {
  const results = await Promise.all(adapters.map(async (adapter) => {
    if (!await adapter.detect()) {
      return {
        rows: [], filesRead: 0, recordsRead: 0,
        warnings: [{ adapter: adapter.id, code: 'not_found', message: `${adapter.id} usage was not found.` }],
      }
    }
    return adapter.scan()
  }))
  const warnings = results.flatMap((result) => result.warnings)
  const rows = results.flatMap((result) => result.rows).map((row) => {
    if (row.tool === 'opencode') return row
    const estimate = estimateCost(row)
    if (estimate.warning) warnings.push({
      adapter: row.tool,
      code: estimate.warning,
      message: `No bundled price for ${row.model}; tokens remain accurate and cost is reported as $0.`,
    })
    return { ...row, costUsd: estimate.costUsd }
  })
  return {
    rows: serializeReportRows(rows).sort((a, b) => a.day.localeCompare(b.day)
      || a.tool.localeCompare(b.tool) || a.model.localeCompare(b.model)),
    filesRead: results.reduce((total, result) => total + result.filesRead, 0),
    recordsRead: results.reduce((total, result) => total + result.recordsRead, 0),
    warnings,
  }
}
