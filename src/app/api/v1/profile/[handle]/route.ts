import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/queries'
import { computeIndex } from '@/lib/index-math'
import { canAppearOnBoards } from '@/lib/consent'

// Raw JSON behind the profile page (see src/app/[handle]/page.tsx). Numbers
// here must match the page exactly, and the shape must stay narrow: getProfile
// already omits xHandle/instagramHandle/tagOptIn/githubId from p.user, and
// this route must not widen that by adding fields from elsewhere.
export async function GET(_: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const p = await getProfile(handle)
  // getProfile already gates internally, but the consent rule must live in
  // one place (canAppearOnBoards) and every public reader re-checks it here
  // rather than trusting the bare publicOptIn flag — see task-10 report.
  if (!p || !canAppearOnBoards({ publicOptIn: p.user.publicOptIn, hasData: p.tools.length > 0 })) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  const breakdown = computeIndex(p.tools, { mergedPrs: p.mergedPrs, contributions: p.contributions })
  return NextResponse.json({
    handle: p.user.handle,
    avatarUrl: p.user.avatarUrl,
    costUsd: p.costUsd,
    anyUnverified: p.anyUnverified,
    output: { mergedPrs: p.mergedPrs, contributions: p.contributions },
    ...breakdown,
    formula: 'Index = sum(sqrt(sessions_t)) over qualifying tools + capped output term',
  })
}
