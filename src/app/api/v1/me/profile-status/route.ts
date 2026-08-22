import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getProfileVisibility } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  const handle = (session?.user as { handle?: string } | undefined)?.handle
  if (!handle) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const status = await getProfileVisibility(handle)
  if (!status) return NextResponse.json({ error: 'not found' }, { status: 404 })

  return NextResponse.json(status, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
