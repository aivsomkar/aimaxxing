import pricingData from '../../packages/reporter/src/pricing-data.json'
import type { ReporterUsageRow } from './reporter-crypto'

type Rates = { input: number; output: number; cacheRead: number; cacheWrite: number }

const rates = pricingData.models as Record<string, Rates>
export const REPORTER_PRICING_VERSION = pricingData.version

export function estimateReporterCost(row: ReporterUsageRow): number {
  if (row.tool === 'opencode') return row.costUsd
  const inferredModel = row.model.startsWith('claude-')
    ? `anthropic/${row.model}`
    : row.model.startsWith('gpt-')
      ? `openai/${row.model}`
      : row.model
  const modelRates = rates[row.model] ?? rates[inferredModel]
  if (!modelRates) return 0
  const cost = (
    row.tokensIn * modelRates.input
    + row.tokensOut * modelRates.output
    + row.cacheRead * modelRates.cacheRead
    + row.cacheWrite * modelRates.cacheWrite
  ) / 1_000_000
  return Math.round((cost + Number.EPSILON) * 10_000) / 10_000
}
