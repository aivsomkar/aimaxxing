import * as React from 'react'
import { ImageResponse } from 'next/og'
import { ProfileCardImage } from '@/components/ProfileCardImage'
import { getPublicProfile } from '@/lib/queries'
import { buildShareCardData, decodeShareHandle } from '@/lib/share-card'

export const dynamic = 'force-dynamic'

export async function GET(_: Request, { params }: { params: Promise<{ handle: string }> }) {
  const handle = decodeShareHandle((await params).handle)
  const profile = await getPublicProfile(handle)
  if (!profile) return Response.json({ error: 'not found' }, { status: 404 })
  const safeHandle = profile.user.handle.replace(/[^a-z0-9_-]/g, '')
  return new ImageResponse(
    <ProfileCardImage data={buildShareCardData(profile)} />,
    {
      width: 1200,
      height: 630,
      headers: {
        'Content-Disposition': `attachment; filename="aimaxxing-${safeHandle}.png"`,
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
      },
    },
  )
}
