import { describe, expect, it } from 'vitest'
import { fetchGitHubOutput, GitHubOutputError } from '../src/lib/github-output'

const NOW = new Date('2026-08-22T00:00:00Z')

function responseBody(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      search: { issueCount: 14 },
      viewer: {
        contributionsCollection: {
          contributionCalendar: { totalContributions: 321 },
          restrictedContributionsCount: 19,
        },
        repositories: {
          nodes: [
            { isArchived: false, pushedAt: '2026-08-21T00:00:00Z' },
            { isArchived: false, pushedAt: '2026-05-01T00:00:00Z' },
            { isArchived: false, pushedAt: '2026-08-20T00:00:00Z' },
            { isArchived: true, pushedAt: '2026-08-21T00:00:00Z' },
          ],
        },
      },
    },
    ...overrides,
  }
}

describe('fetchGitHubOutput', () => {
  it('maps contribution, merged PR, and recently active repository totals', async () => {
    let authorization = ''
    let apiVersion = ''
    const fetcher: typeof fetch = async (_input, init) => {
      const headers = new Headers(init?.headers)
      authorization = headers.get('authorization') ?? ''
      apiVersion = headers.get('x-github-api-version') ?? ''
      return Response.json(responseBody())
    }

    await expect(fetchGitHubOutput('token', 'aivsomkar', NOW, fetcher)).resolves.toEqual({
      mergedPrs: 14,
      activeRepos: 2,
      contributions: 321,
    })
    expect(authorization).toBe('Bearer token')
    expect(apiVersion).toBe('2026-03-10')
  })

  it.each([
    ['http', async () => new Response('token secret response', { status: 403 }), 'http'],
    ['graphql', async () => Response.json(responseBody({ errors: [{ message: 'token secret' }] })), 'graphql'],
    ['missing viewer', async () => Response.json({ data: { search: { issueCount: 1 }, viewer: null } }), 'invalid_response'],
    ['negative count', async () => Response.json({
      data: {
        search: { issueCount: -1 },
        viewer: {
          contributionsCollection: { contributionCalendar: { totalContributions: 1 } },
          repositories: { nodes: [] },
        },
      },
    }), 'invalid_response'],
    ['invalid timestamp', async () => Response.json({
      data: {
        search: { issueCount: 1 },
        viewer: {
          contributionsCollection: { contributionCalendar: { totalContributions: 1 } },
          repositories: { nodes: [{ isArchived: false, pushedAt: 'not-a-date' }] },
        },
      },
    }), 'invalid_response'],
  ])('rejects %s failures with a stable, token-safe code', async (_name, fetcher, code) => {
    let error: unknown
    try {
      await fetchGitHubOutput('token secret', 'aivsomkar', NOW, fetcher as typeof fetch)
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(GitHubOutputError)
    expect((error as GitHubOutputError).code).toBe(code)
    expect(String(error)).not.toContain('token secret')
  })
})
