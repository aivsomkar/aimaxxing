import * as React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProfileCardImage } from '../src/components/ProfileCardImage'
import type { ShareCardData } from '../src/lib/share-card'

const card: ShareCardData = {
  handle: '@builder',
  xHandle: '@builder_ai',
  index: '14.0',
  spend: '$125.50',
  spendLabel: 'EST. API VALUE',
  tokens: '42.8M',
  verificationLabel: 'VERIFIED USAGE',
  toolCount: 2,
  toolLabel: '2 AI tools',
  tools: ['claude-code', 'codex-cli'],
  models: ['claude-opus-4-1', 'gpt-5'],
  projectCount: 3,
  projectLabel: '3 live projects',
  projectTitles: ['Signal Desk', 'Tiny Launch', 'Model Map'],
}

describe('ProfileCardImage', () => {
  it('renders canonical profile, usage, model, spend, token, and project values', () => {
    const html = renderToStaticMarkup(<ProfileCardImage data={card} />)
    for (const value of [
      '@builder', 'claude-code', 'codex-cli', 'claude-opus-4-1', 'gpt-5',
      '$125.50', '42.8M', '3 live projects', 'www.aimaxxing.lol/@builder',
    ]) expect(html).toContain(value)
    expect(html).not.toContain('72%')
    expect(html).toContain('EST. API VALUE')
    expect(html).not.toContain('ACCOUNT SPEND')
    expect(html).not.toContain('AIMAXXING.VERCEL.APP')
  })
})
