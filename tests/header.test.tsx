import * as React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { HeaderNav } from '../src/components/HeaderNav'

describe('HeaderNav', () => {
  it('shows public navigation and sign in to anonymous visitors', () => {
    const html = renderToStaticMarkup(<HeaderNav viewer={null} />)
    expect(html).toContain('href="/methodology"')
    expect(html).toContain('href="/signin"')
    expect(html).toContain('Sign in')
    expect(html).not.toContain('Settings')
  })

  it('shows account navigation and sign out to authenticated visitors', () => {
    const html = renderToStaticMarkup(<HeaderNav viewer={{
      handle: 'aivsomkar', publicOptIn: false,
    }} />)
    expect(html).toContain('href="/methodology"')
    expect(html).toContain('href="/@aivsomkar"')
    expect(html).toContain('@aivsomkar')
    expect(html).toContain('href="/settings"')
    expect(html).toContain('Settings')
    expect(html).toContain('Sign out')
    expect(html).not.toContain('href="/signin"')
  })
})
