import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/db/client'
import { startReporterLink } from '@/lib/reporter-link'

const bodySchema = z.object({
  publicKey: z.string().min(64).max(2_000),
  machineId: z.string().min(16).max(200),
  machineLabel: z.string().trim().min(1).max(80),
}).strict()

export async function POST(request: Request) {
  if (Number(request.headers.get('content-length') ?? 0) > 16_384) {
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
  try {
    return NextResponse.json(await startReporterLink(
      db,
      parsed.data,
      new URL(request.url).origin,
    ))
  } catch {
    console.error('reporter_link_start_failed')
    return NextResponse.json({ error: 'link could not be started' }, { status: 503 })
  }
}
