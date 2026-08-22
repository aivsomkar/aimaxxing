import * as React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AccountDashboard } from '../src/components/AccountDashboard'

const empty = {
  handle: 'aivsomkar',
  state: 'private-empty' as const,
  publicOptIn: false,
  usageCount: 0,
  connectedReporterCount: 0,
  reporters: [],
  projectCount: 0,
  githubSyncedAt: null,
  canPublish: false,
  output: { mergedPrs: 0, activeRepos: 0, contributions: 0 },
}

describe('AccountDashboard', () => {
  it('renders the activation sequence and private preview for an empty account', () => {
    const html = renderToStaticMarkup(<AccountDashboard status={empty} />)
    const labels = ['GitHub connected', 'Show live work', 'Connect AI usage', 'Publish and share']
    expect(labels.map((label) => html.indexOf(label))).toEqual([...labels.map((label) => html.indexOf(label))].sort((a, b) => a - b))
    expect(html).toContain('href="/@aivsomkar"')
    expect(html).toContain('Private preview')
    expect(html).toContain('Publish profile')
    expect(html).not.toContain('Unpublish profile')
    expect(html).toContain('disabled=""')
  })

  it('renders one unpublish action for a public account', () => {
    const html = renderToStaticMarkup(<AccountDashboard status={{
      ...empty,
      state: 'public',
      publicOptIn: true,
      canPublish: true,
      projectCount: 2,
    }} />)
    expect(html).toContain('Unpublish profile')
    expect(html).not.toContain('Publish profile')
    expect(html).toContain('2 live websites')
  })
})
