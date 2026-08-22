import type { UsageAggregate, UsageObservation } from './adapters/types.js'

const DAY = /^\d{4}-\d{2}-\d{2}$/

function safeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

function validObservation(row: UsageObservation): boolean {
  return row.recordId.length > 0
    && row.sessionId.length > 0
    && row.model.length > 0
    && DAY.test(row.day)
    && safeInteger(row.tokensIn)
    && safeInteger(row.tokensOut)
    && safeInteger(row.cacheRead)
    && safeInteger(row.cacheWrite)
    && Number.isFinite(row.costUsd)
    && row.costUsd >= 0
}

function roundedCost(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000
}

export function mergeAggregates(observations: UsageObservation[]): UsageAggregate[] {
  const seenRecords = new Set<string>()
  const groups = new Map<string, {
    row: Omit<UsageAggregate, 'sessions'>
    sessions: Set<string>
  }>()

  for (const observation of observations) {
    if (!validObservation(observation)) throw new Error('invalid usage observation')
    const recordKey = `${observation.tool}\u0000${observation.recordId}`
    if (seenRecords.has(recordKey)) continue
    seenRecords.add(recordKey)

    const key = `${observation.day}\u0000${observation.tool}\u0000${observation.model}`
    const existing = groups.get(key)
    if (existing) {
      existing.row.tokensIn += observation.tokensIn
      existing.row.tokensOut += observation.tokensOut
      existing.row.cacheRead += observation.cacheRead
      existing.row.cacheWrite += observation.cacheWrite
      existing.row.costUsd = roundedCost(existing.row.costUsd + observation.costUsd)
      existing.sessions.add(observation.sessionId)
      continue
    }
    groups.set(key, {
      row: {
        tool: observation.tool,
        model: observation.model,
        day: observation.day,
        tokensIn: observation.tokensIn,
        tokensOut: observation.tokensOut,
        cacheRead: observation.cacheRead,
        cacheWrite: observation.cacheWrite,
        costUsd: roundedCost(observation.costUsd),
      },
      sessions: new Set([observation.sessionId]),
    })
  }

  return [...groups.values()]
    .map(({ row, sessions }) => ({ ...row, sessions: sessions.size }))
    .sort((a, b) => a.day.localeCompare(b.day)
      || a.tool.localeCompare(b.tool)
      || a.model.localeCompare(b.model))
}

export function serializeReportRows(rows: UsageAggregate[]): UsageAggregate[] {
  return rows.map((row) => ({
    tool: row.tool,
    model: row.model,
    day: row.day,
    sessions: row.sessions,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    cacheRead: row.cacheRead,
    cacheWrite: row.cacheWrite,
    costUsd: roundedCost(row.costUsd),
  }))
}
