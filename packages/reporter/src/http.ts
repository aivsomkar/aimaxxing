import type { SignedReporterAction, SignedReporterReport } from './crypto.js'

const REQUEST_TIMEOUT_MS = 15_000
const MAX_RESPONSE_BYTES = 65_536

type Fetch = typeof fetch

export class ReporterHttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'ReporterHttpError'
  }
}

function endpoint(baseUrl: string, path: string): string {
  assertApiBaseUrl(baseUrl)
  return new URL(path, `${baseUrl.replace(/\/$/, '')}/`).toString()
}

// The reporter transmits its public key, machine ID, device code, and signed
// usage over this base URL; a plaintext (or non-HTTP) scheme would expose all
// of them to anyone on the path. Plain HTTP is only tolerated for local
// development hosts.
const INSECURE_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

export function assertApiBaseUrl(baseUrl: string): void {
  let parsed: URL
  try {
    parsed = new URL(baseUrl)
  } catch {
    throw new Error(`AI Maxxing API URL is not a valid URL: ${baseUrl}`)
  }
  if (parsed.protocol === 'https:') return
  if (parsed.protocol === 'http:' && INSECURE_HOSTS.has(parsed.hostname)) return
  throw new Error('AI Maxxing API URL must use HTTPS (plain HTTP is only allowed for localhost).')
}

async function postJson<T>(fetcher: Fetch, url: string, body: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetcher(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    throw new ReporterHttpError(0, 'Could not reach the AI Maxxing API.')
  }
  const text = await response.text()
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
    throw new ReporterHttpError(response.status, 'AI Maxxing returned an oversized response.')
  }
  let parsed: unknown = null
  try { parsed = text ? JSON.parse(text) : null } catch { /* handled below */ }
  if (!response.ok) {
    const code = parsed && typeof parsed === 'object' && 'error' in parsed
      ? String(parsed.error)
      : `http_${response.status}`
    throw new ReporterHttpError(response.status, `AI Maxxing rejected the request (${code}).`)
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new ReporterHttpError(response.status, 'AI Maxxing returned an invalid response.')
  }
  return parsed as T
}

export type StartLinkResponse = {
  deviceCode: string
  userCode: string
  verificationUrl: string
  interval: number
  expiresIn: number
}

export type LinkStatusResponse =
  | { status: 'pending' | 'pending_approval_consumption' }
  | { status: 'approved'; reporterId: string; handle: string }
  | { status: 'denied' | 'expired' }

export function createReporterHttp(fetcher: Fetch = fetch) {
  return {
    startLink(apiBaseUrl: string, input: { publicKey: string; machineId: string; machineLabel: string }) {
      return postJson<StartLinkResponse>(
        fetcher, endpoint(apiBaseUrl, '/api/v1/reporters/link/start'), input,
      )
    },
    pollLink(apiBaseUrl: string, deviceCode: string) {
      return postJson<LinkStatusResponse>(
        fetcher, endpoint(apiBaseUrl, '/api/v1/reporters/link/status'), { deviceCode },
      )
    },
    submitReport(apiBaseUrl: string, report: SignedReporterReport) {
      return postJson<{ ok: true; accepted: number; submissionId: string }>(
        fetcher, endpoint(apiBaseUrl, '/api/v1/reporters/report'), report,
      )
    },
    revokeReporter(apiBaseUrl: string, reporterId: string, action: SignedReporterAction) {
      return postJson<{ ok: true }>(
        fetcher, endpoint(apiBaseUrl, `/api/v1/reporters/${encodeURIComponent(reporterId)}/revoke`), action,
      )
    },
  }
}

export type ReporterHttp = ReturnType<typeof createReporterHttp>
