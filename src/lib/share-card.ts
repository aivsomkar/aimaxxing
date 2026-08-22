import { computeIndex } from '@/lib/index-math'
import { formatUsd } from '@/lib/format'
import type { ProfileRecord } from '@/lib/queries'

export function decodeShareHandle(value: string): string {
  const decoded = decodeURIComponent(value)
  return decoded.startsWith('@') ? decoded.slice(1) : decoded
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

export type ShareCardData = {
  handle: string
  xHandle: string | null
  index: string
  spend: string
  tokens: string
  verificationLabel: string
  toolCount: number
  toolLabel: string
  tools: string[]
  models: string[]
  projectCount: number
  projectLabel: string
  projectTitles: string[]
}

function compact(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

export function buildShareCardData(profile: ProfileRecord): ShareCardData {
  const breakdown = computeIndex(profile.tools, {
    mergedPrs: profile.mergedPrs,
    contributions: profile.contributions,
  })
  const toolCount = profile.tools.length
  const projectCount = profile.projects.length
  const verificationLabel = toolCount === 0
    ? 'USAGE NOT CONNECTED'
    : profile.anyVerified && profile.anyUnverified
      ? 'MIXED USAGE'
      : profile.anyUnverified
        ? 'SELF-REPORTED USAGE'
        : 'VERIFIED USAGE'

  return {
    handle: `@${profile.user.handle}`,
    xHandle: profile.xHandle,
    index: breakdown.index.toLocaleString(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }),
    spend: `$${formatUsd(profile.costUsd)}`,
    tokens: compact(profile.tokenTotals.total),
    verificationLabel,
    toolCount,
    toolLabel: countLabel(toolCount, 'AI tool', 'AI tools'),
    tools: profile.tools.map((tool) => tool.tool).sort().slice(0, 3),
    models: profile.models.map((model) => model.model).sort().slice(0, 3),
    projectCount,
    projectLabel: countLabel(projectCount, 'live project', 'live projects'),
    projectTitles: profile.projects.slice(0, 3).map((project) => project.title),
  }
}
