export type XHandleValidation =
  | { ok: true; value: string | null }
  | { ok: false; error: string }

const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/
const X_APP_ROUTES = new Set([
  'about', 'compose', 'download', 'explore', 'hashtag', 'home', 'i', 'intent',
  'login', 'logout', 'messages', 'notifications', 'privacy', 'search', 'settings',
  'share', 'signup', 'tos',
])

export function normalizeXHandle(input: string): string | null {
  const raw = (input ?? '').trim()
  if (!raw) return null

  let username = raw.replace(/^@/, '')
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw)
      if (url.hostname !== 'x.com' && url.hostname !== 'www.x.com'
        && url.hostname !== 'twitter.com' && url.hostname !== 'www.twitter.com') return null
      const parts = url.pathname.split('/').filter(Boolean)
      if (parts.length !== 1) return null
      username = parts[0]
      if (X_APP_ROUTES.has(username.toLowerCase())) return null
    } catch {
      return null
    }
  }

  return X_HANDLE.test(username) ? `@${username}` : null
}

export function validateXHandle(input: string): XHandleValidation {
  if (!(input ?? '').trim()) return { ok: true, value: null }
  const normalized = normalizeXHandle(input)
  if (!normalized) {
    return {
      ok: false,
      error: 'Enter a valid X username using letters, numbers, or underscores.',
    }
  }
  return { ok: true, value: normalized }
}

export function xProfileUrl(handle: string): string {
  return `https://x.com/${handle.replace(/^@/, '')}`
}
