import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { applyReporterSnapshot, ReporterIngestError } from '@/lib/reporter-ingest'

const MAX_BODY_BYTES = 1_048_576
const RATE_WINDOW_MS = 60_000
const RATE_LIMIT = 12
const requestCounts = new Map<string, { count: number; resetsAt: number }>()

function rateLimited(reporterId: string, now: number): boolean {
  if (requestCounts.size > 10_000) {
    for (const [key, value] of requestCounts) {
      if (value.resetsAt <= now) requestCounts.delete(key)
    }
    if (requestCounts.size > 10_000) requestCounts.delete(requestCounts.keys().next().value!)
  }
  const current = requestCounts.get(reporterId)
  if (!current || current.resetsAt <= now) {
    requestCounts.set(reporterId, { count: 1, resetsAt: now + RATE_WINDOW_MS })
    return false
  }
  current.count += 1
  return current.count > RATE_LIMIT
}

function statusFor(error: ReporterIngestError): number {
  if (error.code === 'invalid_report') return 400
  if (error.code === 'replayed_submission') return 409
  return 401
}

export async function POST(request: Request) {
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
    return NextResponse.json({ error: 'invalid_report' }, { status: 400 })
  }

  const reporterId = typeof body === 'object' && body !== null && 'reporterId' in body
    ? String(body.reporterId)
    : 'invalid'
  if (rateLimited(reporterId, Date.now())) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': '60' } },
    )
  }

  try {
    const accepted = await applyReporterSnapshot(db, body)
    return NextResponse.json({ ok: true, ...accepted })
  } catch (error) {
    if (error instanceof ReporterIngestError) {
      return NextResponse.json({ error: error.code }, { status: statusFor(error) })
    }
    console.error('reporter_ingest_failed')
    return NextResponse.json({ error: 'reporter_unavailable' }, { status: 503 })
  }
}
