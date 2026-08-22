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

export function buildShareCardData(profile: ProfileRecord) {
  const breakdown = computeIndex(profile.tools, {
    mergedPrs: profile.mergedPrs,
    contributions: profile.contributions,
  })
  const toolCount = profile.tools.length
  const projectCount = profile.projects.length

  return {
    handle: `@${profile.user.handle}`,
    xHandle: profile.xHandle,
    index: breakdown.index.toLocaleString(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }),
    spend: `$${formatUsd(profile.costUsd)}`,
    verificationLabel: profile.anyUnverified ? 'INCLUDES SELF-REPORTED' : 'VERIFIED USAGE',
    toolCount,
    toolLabel: countLabel(toolCount, 'AI TOOL', 'AI TOOLS'),
    projectCount,
    projectLabel: countLabel(projectCount, 'LIVE PROJECT', 'LIVE PROJECTS'),
    projectTitles: profile.projects.slice(0, 3).map((project) => project.title),
  }
}
