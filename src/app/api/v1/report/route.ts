import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { db } from '@/db/client'
import { users } from '@/db/schema'
import { reportSchema, normalizeReport, writeReport } from '@/lib/ingest'
import { rateLimit } from '@/lib/rate-limit'

const MAX_BODY_BYTES = 1_048_576
const RATE_LIMIT = 12
const RATE_WINDOW_MS = 60_000

export async function POST(req: Request) {
  const session = await auth()
  const handle = (session?.user as any)?.handle
  if (!handle) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  // Rate limit per signed-in account before touching the body or the database.
  if (rateLimit(`report:${handle}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': '60' } },
    )
  }

  // Cap the buffered body before parsing; zod alone would only reject the
  // payload after it has already been read into memory in full.
  const text = await req.text()
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'request too large' }, { status: 413 })
  }
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 })
  }
  const parsed = reportSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid payload', issues: parsed.error.issues }, { status: 400 })
  }

  const [user] = await db.select().from(users).where(eq(users.handle, handle))
  if (!user) return NextResponse.json({ error: 'no such user' }, { status: 404 })

  // Plan 2 (the reporter CLI) adds signature verification and passes 'reporter' here.
  const rows = normalizeReport(parsed.data, 'manual')
  try {
    await writeReport(db, user.id, rows)
  } catch (err) {
    // Log the real error server-side; never echo driver/constraint text to the caller.
    console.error('writeReport failed', err)
    return NextResponse.json({ error: 'failed to write report' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, rows: rows.length })
}
