import * as React from 'react'
import { ImageResponse } from 'next/og'
import { auth } from '@/auth'
import { ProfileCardImage } from '@/components/ProfileCardImage'
import { getProfileForViewer } from '@/lib/queries'
import { buildShareCardData } from '@/lib/share-card'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  const handle = (session?.user as { handle?: string } | undefined)?.handle
  if (!handle) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const result = await getProfileForViewer(handle, handle)
  if (!result?.isOwner) return Response.json({ error: 'not found' }, { status: 404 })
  const safeHandle = result.profile.user.handle.replace(/[^a-z0-9_-]/g, '')
  return new ImageResponse(
    <ProfileCardImage data={buildShareCardData(result.profile)} />,
    {
      width: 1200,
      height: 630,
      headers: {
        'Content-Disposition': `attachment; filename="aimaxxing-${safeHandle}.png"`,
        'Cache-Control': 'private, no-store',
      },
    },
  )
}
