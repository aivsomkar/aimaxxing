import * as React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Board } from '../src/components/Board'
import { SocialSettings } from '../src/components/SocialSettings'
import { XHandleLink } from '../src/components/XHandleLink'

describe('XHandleLink', () => {
  it('renders a safe external link to the public X profile', () => {
    const html = renderToStaticMarkup(<XHandleLink handle="@Omkar_AI" />)
    expect(html).toContain('href="https://x.com/Omkar_AI"')
    expect(html).toContain('@Omkar_AI')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noreferrer noopener"')
  })
})

describe('Board social identity', () => {
  it('shows the X handle beside a ranked account when present', () => {
    const html = renderToStaticMarkup(<Board
      title="The Index"
      entries={[{
        handle: 'builder', avatarUrl: null, xHandle: '@builder_ai', value: 12,
        verified: true, toolCount: 2, index: 12, display: '$12.00',
      }]}
    />)
    expect(html).toContain('href="/@builder"')
    expect(html).toContain('href="https://x.com/builder_ai"')
  })
})

describe('SocialSettings', () => {
  it('prefills the current X handle and explains that saving publishes it', () => {
    const html = renderToStaticMarkup(<SocialSettings xHandle="@builder_ai" />)
    expect(html).toContain('name="xHandle"')
    expect(html).toContain('value="@builder_ai"')
    expect(html).toContain('Save X handle')
    expect(html).toContain('shown automatically')
  })
})
