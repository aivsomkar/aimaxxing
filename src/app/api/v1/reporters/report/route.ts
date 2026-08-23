import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { applyReporterSnapshot, ReporterIngestError } from '@/lib/reporter-ingest'
import { clientIp, rateLimit } from '@/lib/rate-limit'

const MAX_BODY_BYTES = 1_048_576
const RATE_WINDOW_MS = 60_000
const RATE_LIMIT = 12

function statusFor(error: ReporterIngestError): number {
  if (error.code === 'invalid_report' || error.code === 'unsupported_pricing_version') return 400
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

  // The limiter key pairs the client IP with the claimed reporterId. Keying by
  // reporterId alone would let an attacker who knows a victim's reporter UUID
  // exhaust the victim's quota from anywhere; keying by IP alone would throttle
  // distinct reporters behind one NAT. With the pair, garbage traffic from an
  // attacker's own IP never touches the victim's bucket.
  const reporterId = typeof body === 'object' && body !== null && 'reporterId' in body
    ? String(body.reporterId)
    : 'invalid'
  if (rateLimit(`${clientIp(request)}|${reporterId}`, RATE_LIMIT, RATE_WINDOW_MS)) {
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
    console.error('reporter_ingest_failed', error)
    return NextResponse.json({ error: 'reporter_unavailable' }, { status: 503 })
  }
}
