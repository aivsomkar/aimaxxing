import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { db } from '@/db/client'
import { users } from '@/db/schema'
import {
  applySignedReporterRevocation,
  ReporterRevokeError,
  revokeOwnedReporter,
} from '@/lib/reporter-revoke'

const MAX_BODY_BYTES = 16_384
const ownerBodySchema = z.object({ deleteData: z.boolean().default(false) }).strict()

function signedStatus(error: ReporterRevokeError): number {
  if (error.code === 'invalid_request') return 400
  if (error.code === 'replayed_request') return 409
  return 401
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const reporterId = (await params).id
  if (!z.string().uuid().safeParse(reporterId).success) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'request_too_large' }, { status: 413 })
  }
  let body: unknown
  try {
    const text = await request.text()
    if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'request_too_large' }, { status: 413 })
    }
    body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const isSigned = typeof body === 'object' && body !== null && 'signature' in body
  if (isSigned) {
    try {
      const result = await applySignedReporterRevocation(db, reporterId, body)
      return NextResponse.json({ ok: true, ...result })
    } catch (error) {
      if (error instanceof ReporterRevokeError) {
        return NextResponse.json({ error: error.code }, { status: signedStatus(error) })
      }
      console.error('reporter_self_revoke_failed')
      return NextResponse.json({ error: 'reporter_unavailable' }, { status: 503 })
    }
  }

  const session = await auth()
  const handle = (session?.user as { handle?: string } | undefined)?.handle
  if (!handle) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const parsed = ownerBodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.handle, handle))
  if (!user || !await revokeOwnedReporter(db, user.id, reporterId, parsed.data.deleteData)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true, deletedData: parsed.data.deleteData })
}
