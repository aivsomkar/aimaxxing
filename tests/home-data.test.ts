import { describe, expect, it, vi } from 'vitest'
import { loadPublicHomeData } from '../src/lib/home-data'

describe('public homepage data', () => {
  it('starts the summary and leaderboard queries together', async () => {
    let releaseSummary!: (value: 'summary') => void
    const summary = new Promise<'summary'>((resolve) => { releaseSummary = resolve })
    const loadSummary = vi.fn(() => summary)
    const loadEntrants = vi.fn(async () => 'entrants' as const)

    const result = loadPublicHomeData(loadSummary, loadEntrants)

    expect(loadSummary).toHaveBeenCalledOnce()
    expect(loadEntrants).toHaveBeenCalledOnce()
    releaseSummary('summary')
    await expect(result).resolves.toEqual({ summary: 'summary', entrants: 'entrants' })
  })
})
