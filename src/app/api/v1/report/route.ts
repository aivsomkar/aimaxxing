import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { db } from '@/db/client'
import { users, toolDays } from '@/db/schema'
import { reportSchema, normalizeReport } from '@/lib/ingest'

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
  for (const r of rows) {
    await db.insert(toolDays).values({ userId: user.id, ...r })
      .onConflictDoUpdate({
        target: [toolDays.userId, toolDays.tool, toolDays.model, toolDays.day],
        set: { ...r },
      })
  }
  return NextResponse.json({ ok: true, rows: rows.length })
}
