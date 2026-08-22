import pricingData from './pricing-data.json' with { type: 'json' }

type Rates = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

type EstimateInput = {
  model: string
  tokensIn: number
  tokensOut: number
  cacheRead: number
  cacheWrite: number
  explicitCost?: number | null
}

const models = pricingData.models as Record<string, Rates>
export const PRICING_VERSION = pricingData.version

function rounded(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000
}

export function estimateCost(input: EstimateInput): {
  costUsd: number
  warning: 'unknown_price' | null
} {
  if (input.explicitCost !== undefined && input.explicitCost !== null) {
    if (!Number.isFinite(input.explicitCost) || input.explicitCost < 0) {
      throw new Error('invalid explicit cost')
    }
    return { costUsd: rounded(input.explicitCost), warning: null }
  }
  for (const value of [input.tokensIn, input.tokensOut, input.cacheRead, input.cacheWrite]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('invalid token count')
  }
  const rates = models[input.model]
  if (!rates) return { costUsd: 0, warning: 'unknown_price' }
  const cost = (
    input.tokensIn * rates.input
    + input.tokensOut * rates.output
    + input.cacheRead * rates.cacheRead
    + input.cacheWrite * rates.cacheWrite
  ) / 1_000_000
  return { costUsd: rounded(cost), warning: null }
}
