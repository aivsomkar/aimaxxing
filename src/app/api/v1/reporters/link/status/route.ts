import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/db/client'
import { pollReporterLink } from '@/lib/reporter-link'

const bodySchema = z.object({ deviceCode: z.string().min(32).max(100) }).strict()

export async function POST(request: Request) {
  if (Number(request.headers.get('content-length') ?? 0) > 2_048) {
    return NextResponse.json({ error: 'request too large' }, { status: 413 })
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'invalid request' }, { status: 400 })
  return NextResponse.json(await pollReporterLink(db, parsed.data.deviceCode))
}
