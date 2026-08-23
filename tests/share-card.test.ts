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
    xHandle: '@omkar_ai',
    tools: [
      { tool: 'codex-cli', sessions: 25, costUsd: 75.5 },
      { tool: 'claude-code', sessions: 25, costUsd: 50 },
    ],
    models: [
      { model: 'gpt-5', tokens: 30_000_000, costUsd: 75.5 },
      { model: 'claude-opus-4-1', tokens: 12_800_000, costUsd: 50 },
    ],
    tokenTotals: {
      input: 10_000_000, output: 2_800_000, cacheRead: 29_000_000, cacheWrite: 1_000_000, total: 42_800_000,
    },
    costUsd: 125.5,
    mergedPrs: 4,
    activeRepos: 2,
    contributions: 0,
    anyUnverified: false,
    anyVerified: true,
    projects: [
      {
        id: 1, source: 'github', title: 'Signal Desk', description: null,
        liveUrl: 'https://signal.example', repositoryUrl: null, sortOrder: 0,
      },
      {
        id: 2, source: 'manual', title: 'Tiny Launch', description: null,
        liveUrl: 'https://tiny.example', repositoryUrl: null, sortOrder: 1,
      },
      {
        id: 3, source: 'manual', title: 'Model Map', description: null,
        liveUrl: 'https://model.example', repositoryUrl: null, sortOrder: 2,
      },
    ],
  }

  it('formats the shared Index, spend, verification, tools, and live projects', () => {
    expect(buildShareCardData(profile)).toMatchObject({
      handle: '@omkar',
      xHandle: '@omkar_ai',
      index: '14.0',
      spend: '$125.50',
      spendLabel: 'EST. API VALUE',
      verificationLabel: 'VERIFIED USAGE',
      tokens: '42.8M',
      tools: ['claude-code', 'codex-cli'],
      models: ['claude-opus-4-1', 'gpt-5'],
      toolCount: 2,
      toolLabel: '2 AI tools',
      projectCount: 3,
      projectLabel: '3 live projects',
      projectTitles: ['Signal Desk', 'Tiny Launch', 'Model Map'],
    })
  })

  it('uses singular labels and marks self-reported usage', () => {
    expect(buildShareCardData({
      ...profile,
      tools: profile.tools.slice(0, 1),
      projects: [],
      anyVerified: false,
      anyUnverified: true,
    })).toMatchObject({
      toolLabel: '1 AI tool',
      projectLabel: '0 live projects',
      verificationLabel: 'SELF-REPORTED USAGE',
      spendLabel: 'SELF-REPORTED SPEND',
    })
  })

  it('describes an empty usage profile without a fake verification claim or progress value', () => {
    const card = buildShareCardData({
      ...profile,
      tools: [],
      models: [],
      tokenTotals: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      costUsd: 0,
      anyVerified: false,
      anyUnverified: false,
    })
    expect(card).toMatchObject({
      verificationLabel: 'USAGE NOT CONNECTED',
      tokens: '0',
      tools: [],
      models: [],
    })
    expect(card).not.toHaveProperty('percentile')
    expect(card).not.toHaveProperty('progress')
  })
})
