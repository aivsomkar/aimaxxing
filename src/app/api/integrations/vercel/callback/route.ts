import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db/client'
import { users } from '@/db/schema'
import {
  completeImportSession,
  getImportSessionByStateHash,
} from '@/lib/portfolio-store'
import {
  exchangeVercelCode,
  fetchVercelPortfolioCandidates,
  hashImportState,
  verifyImportState,
} from '@/lib/vercel-portfolio'

function settingsUrl(request: Request, name: 'error' | 'notice', message: string): URL {
  const url = new URL('/settings/portfolio', request.url)
  url.searchParams.set(name, message)
  return url
}

export async function GET(request: Request) {
  const session = await auth()
  const handle = (session?.user as { handle?: string } | undefined)?.handle
  if (!handle) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const callback = new URL(request.url)
  if (callback.searchParams.has('error')) {
    return NextResponse.redirect(settingsUrl(request, 'notice', 'Vercel connection canceled.'))
  }
  const state = callback.searchParams.get('state') ?? ''
  const code = callback.searchParams.get('code') ?? ''
  if (!state || !code) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const [user] = await db.select().from(users).where(eq(users.handle, handle))
  if (!user) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const stateHash = hashImportState(state)
  const importSession = await getImportSessionByStateHash(db, user.id, 'vercel', stateHash)
  if (!importSession?.stateHash || !verifyImportState(state, importSession.stateHash)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const clientId = process.env.VERCEL_INTEGRATION_ID
  const clientSecret = process.env.VERCEL_INTEGRATION_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(settingsUrl(request, 'error', 'Vercel import is not configured yet.'))
  }

  try {
    const redirectUri = new URL('/api/integrations/vercel/callback', request.url).toString()
    const token = await exchangeVercelCode(code, { clientId, clientSecret, redirectUri })
    const candidates = await fetchVercelPortfolioCandidates(token.accessToken, token.teamId)
    await completeImportSession(db, user.id, importSession.id, candidates)

    const selection = new URL('/settings/portfolio', request.url)
    selection.searchParams.set('import', importSession.id)
    return NextResponse.redirect(selection)
  } catch (error) {
    console.error('Vercel portfolio import failed', error)
    return NextResponse.redirect(settingsUrl(
      request,
      'error',
      'Vercel import failed. Please try again.',
    ))
  }
}
