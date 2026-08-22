import { computeIndex, qualifies, type ToolDepth } from './index-math'

export type BoardKind = 'burn' | 'breadth' | 'efficiency' | 'index'

export type Entrant = {
  handle: string
  avatarUrl: string | null
  tools: ToolDepth[]
  costUsd: number
  mergedPrs: number
  contributions: number
  anyUnverified: boolean
}

export type BoardEntry = {
  handle: string
  avatarUrl: string | null
  value: number
  verified: boolean
  toolCount: number
  index: number
}

export function rankBoard(kind: BoardKind, entrants: Entrant[]): BoardEntry[] {
  const rows = entrants.flatMap((e) => {
    const breakdown = computeIndex(e.tools, { mergedPrs: e.mergedPrs, contributions: e.contributions })
    const toolCount = e.tools.filter(qualifies).length

    let value: number
    if (kind === 'burn') value = e.costUsd
    else if (kind === 'breadth') value = toolCount
    else if (kind === 'index') value = breakdown.index
    else {
      // Efficiency is undefined without shipped output; omit rather than rank at infinity.
      if (e.mergedPrs <= 0) return []
      value = e.costUsd / e.mergedPrs
    }

    return [{
      handle: e.handle, avatarUrl: e.avatarUrl, value,
      verified: !e.anyUnverified, toolCount, index: breakdown.index,
    }]
  })

  const ascending = kind === 'efficiency'
  return rows.sort((a, b) => {
    if (a.value !== b.value) return ascending ? a.value - b.value : b.value - a.value
    // Verified outranks self-reported at equal value.
    if (a.verified !== b.verified) return a.verified ? -1 : 1
    return a.handle.localeCompare(b.handle)
  })
}
