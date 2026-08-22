import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db/client'
import { users } from '@/db/schema'
import { createImportSession } from '@/lib/portfolio-store'
import { createVercelAuthorizationUrl, hashImportState } from '@/lib/vercel-portfolio'

function settingsRedirect(request: Request, message: string) {
  const url = new URL('/settings/portfolio', request.url)
  url.searchParams.set('error', message)
  return NextResponse.redirect(url)
}

export async function GET(request: Request) {
  const session = await auth()
  const handle = (session?.user as { handle?: string } | undefined)?.handle
  if (!handle) {
    const signIn = new URL('/api/auth/signin', request.url)
    signIn.searchParams.set('callbackUrl', '/settings/portfolio')
    return NextResponse.redirect(signIn)
  }

  const integrationId = process.env.VERCEL_INTEGRATION_ID
  const clientSecret = process.env.VERCEL_INTEGRATION_CLIENT_SECRET
  const slug = process.env.VERCEL_INTEGRATION_SLUG
  if (!integrationId || !clientSecret || !slug) {
    return settingsRedirect(request, 'Vercel import is not configured yet.')
  }

  const [user] = await db.select().from(users).where(eq(users.handle, handle))
  if (!user) return settingsRedirect(request, 'Your account could not be found.')

  const state = randomBytes(32).toString('base64url')
  await createImportSession(db, user.id, 'vercel', [], {
    stateHash: hashImportState(state),
  })
  return NextResponse.redirect(createVercelAuthorizationUrl(state, slug))
}
