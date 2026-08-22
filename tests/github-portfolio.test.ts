import { describe, expect, it } from 'vitest'
import {
  fetchGitHubPortfolioCandidates,
  githubIdentityFromProfile,
} from '../src/lib/github-portfolio'

describe('githubIdentityFromProfile', () => {
  it('extracts the stable ID, current login, and avatar without deriving a public handle', () => {
    expect(githubIdentityFromProfile({
      id: 123,
      login: 'OmkarNow',
      avatar_url: 'https://avatars.githubusercontent.com/u/123',
    })).toEqual({
      githubId: '123',
      githubLogin: 'OmkarNow',
      avatarUrl: 'https://avatars.githubusercontent.com/u/123',
    })
  })

  it('returns null when GitHub does not provide an account ID', () => {
    expect(githubIdentityFromProfile({ login: 'missing-id' })).toBeNull()
  })
})

describe('fetchGitHubPortfolioCandidates', () => {
  it('keeps only eligible sites and deduplicates by live URL', async () => {
    let requestedUrl = ''
    let requestedAccept = ''
    const fetcher: typeof fetch = async (input, init) => {
      requestedUrl = String(input)
      requestedAccept = new Headers(init?.headers).get('accept') ?? ''
      return new Response(JSON.stringify([
        {
          id: 1, name: 'arena', description: 'Live', homepage: 'https://arena.dev',
          html_url: 'https://github.com/omkar/arena', fork: false, archived: false, disabled: false,
        },
        {
          id: 2, name: 'duplicate', description: null, homepage: 'https://arena.dev/',
          html_url: 'https://github.com/omkar/duplicate', fork: false, archived: false, disabled: false,
        },
        {
          id: 3, name: 'fork', description: null, homepage: 'https://fork.dev',
          html_url: 'https://github.com/omkar/fork', fork: true, archived: false, disabled: false,
        },
        {
          id: 4, name: 'no-site', description: null, homepage: null,
          html_url: 'https://github.com/omkar/no-site', fork: false, archived: false, disabled: false,
        },
      ]), { status: 200, headers: { 'content-type': 'application/json' } })
    }

    await expect(fetchGitHubPortfolioCandidates('om kar', fetcher)).resolves.toEqual([{
      externalId: '1',
      source: 'github',
      title: 'arena',
      description: 'Live',
      liveUrl: 'https://arena.dev',
      repositoryUrl: 'https://github.com/omkar/arena',
    }])
    expect(requestedUrl).toBe(
      'https://api.github.com/users/om%20kar/repos?type=owner&sort=updated&per_page=100',
    )
    expect(requestedAccept).toBe('application/vnd.github+json')
  })

  it('reports an HTTP failure without exposing the response body', async () => {
    const fetcher: typeof fetch = async () => new Response('secret upstream details', { status: 403 })
    await expect(fetchGitHubPortfolioCandidates('omkar', fetcher))
      .rejects.toThrow('GitHub import failed (403)')
    await expect(fetchGitHubPortfolioCandidates('omkar', fetcher))
      .rejects.not.toThrow('secret upstream details')
  })

  it('rejects a successful response that is not a repository array', async () => {
    const fetcher: typeof fetch = async () => Response.json({ message: 'not an array' })
    await expect(fetchGitHubPortfolioCandidates('omkar', fetcher))
      .rejects.toThrow('GitHub import returned an invalid response')
  })
})
