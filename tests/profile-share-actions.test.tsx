import * as React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProfileShareActions } from '../src/components/ProfileShareActions'
import { buildXShareUrl, canonicalProfileUrl } from '../src/lib/share-intent'

describe('share intent', () => {
  it('uses an encoded sentence and canonical production profile URL', () => {
    const intent = new URL(buildXShareUrl('builder', '14.0'))
    expect(intent.origin + intent.pathname).toBe('https://twitter.com/intent/tweet')
    expect(intent.searchParams.get('url')).toBe('https://www.aimaxxing.lol/@builder')
    expect(intent.searchParams.get('text')).toContain('AI Maxxing Index is 14.0')
    expect(canonicalProfileUrl('builder')).toBe('https://www.aimaxxing.lol/@builder')
  })
})

describe('ProfileShareActions', () => {
  it('enables X, copy, generic share, and public download after publication', () => {
    const html = renderToStaticMarkup(<ProfileShareActions
      handle="builder"
      index="14.0"
      isPublic
      downloadUrl="/api/v1/profile/builder/card"
    />)
    expect(html).toContain('Share on X')
    expect(html).toContain('Copy profile link')
    expect(html).toContain('Share profile')
    expect(html).toContain('Download card')
    expect(html).toContain('href="/api/v1/profile/builder/card"')
    expect(html).toContain('aria-live="polite"')
    expect(html).not.toContain('disabled=""')
  })

  it('disables public sharing for private previews but keeps owner download', () => {
    const html = renderToStaticMarkup(<ProfileShareActions
      handle="builder"
      index="14.0"
      isPublic={false}
      downloadUrl="/api/v1/me/card"
    />)
    expect((html.match(/disabled=""/g) ?? [])).toHaveLength(3)
    expect(html).toContain('href="/api/v1/me/card"')
    expect(html).toContain('Publish your profile to enable sharing')
  })
})
