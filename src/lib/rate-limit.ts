// Best-effort in-process rate limiting. Each serverless instance keeps its own
// counters, so limits are per-instance on Vercel; this still bounds abuse from
// any single client and is intentionally dependency-free.
type Bucket = { count: number; resetsAt: number }

const buckets = new Map<string, Bucket>()
const MAX_BUCKETS = 10_000

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  if (buckets.size > MAX_BUCKETS) {
    for (const [k, v] of buckets) {
      if (v.resetsAt <= now) buckets.delete(k)
    }
    if (buckets.size > MAX_BUCKETS) buckets.delete(buckets.keys().next().value!)
  }
  const current = buckets.get(key)
  if (!current || current.resetsAt <= now) {
    buckets.set(key, { count: 1, resetsAt: now + windowMs })
    return false
  }
  current.count += 1
  return current.count > limit
}

// Behind Vercel the real client IP arrives in x-forwarded-for; fall back to a
// constant so direct connections from one host share one bucket rather than
// being unthrottled.
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}
