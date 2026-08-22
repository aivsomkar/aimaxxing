//
// The published Index formula. Every constant here appears verbatim on /methodology,
// and every intermediate value is returned so a reader can recompute the result from
// the JSON at /@handle.json. Do not add a term that is not rendered on the profile.

export const QUALIFY_SESSIONS = 20
export const QUALIFY_COST_USD = 5
export const OUTPUT_CAP = 20
export const CONTRIBUTIONS_PER_UNIT = 25

export type ToolDepth = { tool: string; sessions: number; costUsd: number }
export type Output = { mergedPrs: number; contributions: number }

export type IndexBreakdown = {
  perTool: { tool: string; sessions: number; score: number; qualified: boolean }[]
  stackDepth: number
  outputTerm: number
  index: number
}

export function qualifies(t: ToolDepth): boolean {
  return t.sessions >= QUALIFY_SESSIONS || t.costUsd >= QUALIFY_COST_USD
}

// Concave in sessions: the marginal session in a new tool is worth more than the
// nth session in an existing one. Spend is deliberately absent - see the spec.
export function toolScore(t: ToolDepth): number {
  return Math.sqrt(Math.max(0, t.sessions))
}

export function outputTerm(o: Output): number {
  const units = Math.max(0, o.mergedPrs) + Math.max(0, o.contributions) / CONTRIBUTIONS_PER_UNIT
  return Math.min(OUTPUT_CAP, 2 * Math.sqrt(units))
}

export function computeIndex(tools: ToolDepth[], output: Output): IndexBreakdown {
  const perTool = tools.map((t) => {
    const qualified = qualifies(t)
    return { tool: t.tool, sessions: t.sessions, score: qualified ? toolScore(t) : 0, qualified }
  })
  const stackDepth = perTool.reduce((a, p) => a + p.score, 0)
  const term = outputTerm(output)
  return { perTool, stackDepth, outputTerm: term, index: stackDepth + term }
}
