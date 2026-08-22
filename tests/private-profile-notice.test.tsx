import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PrivateProfileNoticeContent } from '../src/components/PrivateProfileNotice'

describe('PrivateProfileNoticeContent', () => {
  it('shows setup guidance when the fresh profile status is private', () => {
    const html = renderToStaticMarkup(<PrivateProfileNoticeContent isPublic={false} />)
    expect(html).toContain('Your profile is private')
    expect(html).toContain('href="/settings"')
  })

  it('stays hidden for public or not-yet-loaded profile status', () => {
    expect(renderToStaticMarkup(<PrivateProfileNoticeContent isPublic />)).toBe('')
    expect(renderToStaticMarkup(<PrivateProfileNoticeContent isPublic={null} />)).toBe('')
  })
})
