export function normalizeDatabaseUrl(value: string): string {
  if (value.startsWith('pglite://')) return value
  try {
    const url = new URL(value)
    if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') return value
    if (url.searchParams.get('sslmode') === 'require') {
      url.searchParams.set('sslmode', 'verify-full')
    }
    return url.toString()
  } catch {
    return value
  }
}
