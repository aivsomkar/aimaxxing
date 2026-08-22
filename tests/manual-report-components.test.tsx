import * as React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ManualReportForm } from '../src/components/ManualReportForm'

describe('ManualReportForm', () => {
  it('renders sessions, spend, and all optional token fields with accessible descriptions', () => {
    const html = renderToStaticMarkup(<ManualReportForm handle="aivsomkar" />)
    for (const field of ['sessions', 'costUsd', 'tokensIn', 'tokensOut', 'cacheRead', 'cacheWrite']) {
      expect(html).toContain(`name="${field}"`)
    }
    expect(html).toContain('Input tokens')
    expect(html).toContain('Cache read tokens')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('href="/settings"')
  })
})
