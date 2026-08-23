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

// Agents report bracketed placeholders (Claude Code's "<synthetic>") for work that
// ran no real model. Their spend still belongs in the collective total, but naming
// them in the public model breakdown pollutes the one artifact that is supposed to
// be defensible market-share data.
const isPlaceholderModel = (model: string) => /^<.*>$/.test(model.trim())

/** Anything below this share is legend noise rather than signal. */
export const OTHER_THRESHOLD = 0.01
export const OTHER_LABEL = 'other'

type Grouped = { key: string; costUsd: number; share: number }

// Collapse the long tail into a single bucket so the legend stays readable.
// Only collapses when it actually shortens the list: folding a lone sub-threshold
// entry into "other" would hide its name without saving a row.
function collapseTail(groups: Grouped[]): Grouped[] {
  const small = groups.filter((g) => g.share < OTHER_THRESHOLD)
  if (small.length < 2) return groups

  const large = groups.filter((g) => g.share >= OTHER_THRESHOLD)
  const costUsd = small.reduce((a, g) => a + g.costUsd, 0)
  const share = small.reduce((a, g) => a + g.share, 0)
  return [...large, { key: OTHER_LABEL, costUsd, share }]
}

/**
 * The single presentation rule for the public model legend: drop placeholders,
 * renormalise over what is left, collapse the long tail.
 *
 * Both callers go through here — `shareByModel` (row-shaped input) and
 * `getCollectiveSummary` (pre-aggregated SQL sums). Keeping one function means a
 * future third caller cannot quietly render a different-looking breakdown.
 */
export function presentModelShares(costs: { model: string; costUsd: number }[]) {
  const real = costs.filter((c) => !isPlaceholderModel(c.model))
  const total = real.reduce((a, c) => a + c.costUsd, 0)
  if (total <= 0) return []

  const groups = real
    .map((c) => ({ key: c.model, costUsd: c.costUsd, share: c.costUsd / total }))
    .sort((a, b) => b.costUsd - a.costUsd || a.key.localeCompare(b.key))

  return collapseTail(groups).map(({ key, costUsd, share }) => ({ model: key, costUsd, share }))
}

export function shareByModel(rows: BurnRow[]) {
  return presentModelShares(
    groupShare(rows, (r) => r.model).map(({ key, costUsd }) => ({ model: key, costUsd })),
  )
}

export function shareByTool(rows: BurnRow[]) {
  return collapseTail(groupShare(rows, (r) => r.tool))
    .map(({ key, costUsd, share }) => ({ tool: key, costUsd, share }))
}
