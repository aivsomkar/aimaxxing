import { describe, expect, it } from 'vitest'
import { buildShareCardData, decodeShareHandle } from '../src/lib/share-card'

describe('decodeShareHandle', () => {
  it.each(['%40omkar', '@omkar', 'omkar'])('normalizes %s to the stable handle', (value) => {
    expect(decodeShareHandle(value)).toBe('omkar')
  })
})

describe('buildShareCardData', () => {
  const profile = {
    user: { id: 1, handle: 'omkar', avatarUrl: null, publicOptIn: true },
    tools: [
      { tool: 'codex', sessions: 25, costUsd: 75.5 },
      { tool: 'claude-code', sessions: 25, costUsd: 50 },
    ],
    costUsd: 125.5,
    mergedPrs: 4,
    contributions: 0,
    anyUnverified: false,
    projects: [{
      id: 1, source: 'github', title: 'Signal Desk', description: null,
      liveUrl: 'https://signal.example', repositoryUrl: null, sortOrder: 0,
    }],
  }

  it('formats the shared Index, spend, verification, tools, and live projects', () => {
    expect(buildShareCardData(profile)).toMatchObject({
      handle: '@omkar',
      index: '14.0',
      spend: '$125.50',
      verificationLabel: 'VERIFIED USAGE',
      toolCount: 2,
      toolLabel: '2 AI TOOLS',
      projectCount: 1,
      projectLabel: '1 LIVE PROJECT',
      projectTitles: ['Signal Desk'],
    })
  })

  it('uses singular labels and marks self-reported usage', () => {
    expect(buildShareCardData({
      ...profile,
      tools: profile.tools.slice(0, 1),
      projects: [],
      anyUnverified: true,
    })).toMatchObject({
      toolLabel: '1 AI TOOL',
      projectLabel: '0 LIVE PROJECTS',
      verificationLabel: 'INCLUDES SELF-REPORTED',
    })
  })
})
