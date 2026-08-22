import * as React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PortfolioGrid } from '../src/components/PortfolioGrid'

describe('PortfolioGrid', () => {
  it('renders nothing when a user has not selected any live projects', () => {
    expect(renderToStaticMarkup(<PortfolioGrid projects={[]} />)).toBe('')
  })

  it('renders the selected projects as safe external links', () => {
    const html = renderToStaticMarkup(
      <PortfolioGrid projects={[
        {
          id: 1,
          source: 'github',
          title: 'Signal Desk',
          description: 'A focused AI research workspace.',
          liveUrl: 'https://signal.example/dashboard',
          repositoryUrl: 'https://github.com/builder/signal',
          sortOrder: 0,
        },
        {
          id: 2,
          source: 'manual',
          title: 'Tiny Launch',
          description: null,
          liveUrl: 'https://tiny.example',
          repositoryUrl: null,
          sortOrder: 1,
        },
      ]} />,
    )

    expect(html).toContain('BUILT · 2 LIVE PROJECTS')
    expect(html).toContain('Signal Desk')
    expect(html).toContain('Tiny Launch')
    expect(html).toContain('signal.example')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noreferrer noopener"')
  })
})
