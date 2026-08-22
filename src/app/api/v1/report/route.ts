import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { db } from '@/db/client'
import { users } from '@/db/schema'
import { reportSchema, normalizeReport, writeReport } from '@/lib/ingest'

export async function POST(req: Request) {
  const session = await auth()
  const handle = (session?.user as any)?.handle
  if (!handle) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const parsed = reportSchema.safeParse(await req.json().catch(() => null))
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
    return NextResponse.json({ error: 'failed to write report', message: String(err) }, { status: 500 })
  }
  return NextResponse.json({ ok: true, rows: rows.length })
}
