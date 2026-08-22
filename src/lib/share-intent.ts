const CANONICAL_ORIGIN = 'https://www.aimaxxing.lol'

export function canonicalProfileUrl(handle: string): string {
  return `${CANONICAL_ORIGIN}/@${encodeURIComponent(handle.replace(/^@/, ''))}`
}

export function buildXShareUrl(handle: string, index: string): string {
  const params = new URLSearchParams({
    text: `My AI Maxxing Index is ${index}. Here are the AI tools I use and the things I shipped.`,
    url: canonicalProfileUrl(handle),
  })
  return `https://twitter.com/intent/tweet?${params.toString()}`
}
