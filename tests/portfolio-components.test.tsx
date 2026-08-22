import * as React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PortfolioGrid } from '../src/components/PortfolioGrid'
import { PortfolioManager } from '../src/components/PortfolioManager'

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

describe('PortfolioManager', () => {
  it('offers provider imports and all fields needed to add a website manually', () => {
    const html = renderToStaticMarkup(
      <PortfolioManager projects={[]} importSession={null} />,
    )

    expect(html).toContain('Import from GitHub')
    expect(html).toContain('Connect Vercel')
    expect(html).toContain('Add another website')
    expect(html).toContain('name="title"')
    expect(html).toContain('name="liveUrl"')
    expect(html).toContain('name="description"')
    expect(html).toContain('name="repositoryUrl"')
  })
})
