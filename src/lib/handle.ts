export const RESERVED_HANDLES = new Set([
  'api', 'link', 'methodology', 'report', 'settings', 'signin', 'sponsor',
])

// A handle is a public URL other pages link to, so it is derived once at creation
// and never moves, even if the GitHub login later changes.
export function deriveHandle(login: string, taken: Set<string>): string {
  const base = login.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  const root = base.length > 0 ? base : `dev-${Math.abs(hash(login)) % 100000}`
  if (!taken.has(root) && !RESERVED_HANDLES.has(root)) return root
  for (let n = 2; ; n++) {
    const candidate = `${root}-${n}`
    if (!taken.has(candidate) && !RESERVED_HANDLES.has(candidate)) return candidate
  }
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}
