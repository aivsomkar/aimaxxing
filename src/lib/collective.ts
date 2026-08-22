export type BurnRow = {
  tool: string; model: string; costUsd: number
  tokensIn: number; tokensOut: number; cacheRead: number; cacheWrite: number
  sponsored: boolean; verified: boolean
}

export type CollectiveTotals = {
  costUsd: number; tokensTotal: number
  tokensIn: number; tokensOut: number; cacheRead: number; cacheWrite: number
}

// Sponsored credits never inflate the headline number - see spec section 9.
const spendable = (rows: BurnRow[]) => rows.filter((r) => !r.sponsored)

export function collectiveTotals(rows: BurnRow[]): CollectiveTotals {
  const r = spendable(rows)
  const sum = (f: (x: BurnRow) => number) => r.reduce((a, x) => a + f(x), 0)
  const tokensIn = sum((x) => x.tokensIn)
  const tokensOut = sum((x) => x.tokensOut)
  const cacheRead = sum((x) => x.cacheRead)
  const cacheWrite = sum((x) => x.cacheWrite)
  return {
    costUsd: sum((x) => x.costUsd),
    tokensIn, tokensOut, cacheRead, cacheWrite,
    tokensTotal: tokensIn + tokensOut + cacheRead + cacheWrite,
  }
}

function groupShare(rows: BurnRow[], key: (r: BurnRow) => string) {
  // Verified rows only: the by-model split is the data asset and must be defensible.
  const r = spendable(rows).filter((x) => x.verified)
  const total = r.reduce((a, x) => a + x.costUsd, 0)
  if (total <= 0) return []
  const acc = new Map<string, number>()
  for (const x of r) acc.set(key(x), (acc.get(key(x)) ?? 0) + x.costUsd)
  return [...acc.entries()]
    .map(([k, costUsd]) => ({ key: k, costUsd, share: costUsd / total }))
    .sort((a, b) => b.costUsd - a.costUsd)
}

export function shareByModel(rows: BurnRow[]) {
  return groupShare(rows, (r) => r.model).map(({ key, costUsd, share }) => ({ model: key, costUsd, share }))
}

export function shareByTool(rows: BurnRow[]) {
  return groupShare(rows, (r) => r.tool).map(({ key, costUsd, share }) => ({ tool: key, costUsd, share }))
}
