import { NextResponse } from 'next/server'
import { getPublicProfile } from '@/lib/queries'
import { computeIndex } from '@/lib/index-math'

// Raw JSON behind the profile page (see src/app/[handle]/page.tsx). Numbers
// here must match the page exactly, and the shape must stay narrow: getProfile
// already omits xHandle/instagramHandle/tagOptIn/githubId from p.user, and
// this route must not widen that by adding fields from elsewhere.
export async function GET(_: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const p = await getPublicProfile(handle)
  if (!p) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  const breakdown = computeIndex(p.tools, { mergedPrs: p.mergedPrs, contributions: p.contributions })
  return NextResponse.json({
    handle: p.user.handle,
    xHandle: p.xHandle,
    avatarUrl: p.user.avatarUrl,
    costUsd: p.costUsd,
    anyUnverified: p.anyUnverified,
    tools: p.tools,
    models: p.models,
    tokenTotals: p.tokenTotals,
    projects: p.projects,
    output: {
      mergedPrs: p.mergedPrs,
      activeRepos: p.activeRepos,
      contributions: p.contributions,
    },
    ...breakdown,
    formula: 'Index = sum(sqrt(sessions_t)) over qualifying tools + capped output term',
  })
}
