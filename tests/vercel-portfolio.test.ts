import { describe, expect, it, vi } from 'vitest'
import {
  createVercelAuthorizationUrl,
  exchangeVercelCode,
  fetchVercelPortfolioCandidates,
  hashImportState,
  verifyImportState,
} from '../src/lib/vercel-portfolio'

describe('Vercel integration state', () => {
  it('builds the installation URL with the opaque state', () => {
    expect(createVercelAuthorizationUrl('state with spaces', 'ai-maxxing').toString())
      .toBe('https://vercel.com/integrations/ai-maxxing/new?state=state+with+spaces')
  })

  it('hashes state and compares it without accepting a different value', () => {
    const hash = hashImportState('secret-state')
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(verifyImportState('secret-state', hash)).toBe(true)
    expect(verifyImportState('other-state', hash)).toBe(false)
    expect(verifyImportState('secret-state', 'malformed')).toBe(false)
  })
})

describe('exchangeVercelCode', () => {
  it('exchanges a short-lived code without exposing the client secret in the URL', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      access_token: 'vercel-access-token',
      team_id: 'team_1',
    }), { status: 200 }))

    await expect(exchangeVercelCode('code_1', {
      clientId: 'client_1',
      clientSecret: 'client-secret',
      redirectUri: 'https://aimaxxing.vercel.app/api/integrations/vercel/callback',
    }, fetcher)).resolves.toEqual({ accessToken: 'vercel-access-token', teamId: 'team_1' })

    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe('https://api.vercel.com/v2/oauth/access_token')
    expect(String(url)).not.toContain('client-secret')
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/x-www-form-urlencoded' })
    expect(String(init?.body)).toContain('client_secret=client-secret')
  })

  it('rejects a failed exchange without leaking the response body', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('secret provider detail', { status: 401 }))
    await expect(exchangeVercelCode('bad', {
      clientId: 'id', clientSecret: 'secret', redirectUri: 'https://example.com/callback',
    }, fetcher)).rejects.toThrow('Vercel token exchange failed (401)')
    await expect(exchangeVercelCode('bad', {
      clientId: 'id', clientSecret: 'secret', redirectUri: 'https://example.com/callback',
    }, fetcher)).rejects.not.toThrow('secret provider detail')
  })
})

describe('fetchVercelPortfolioCandidates', () => {
  it('maps granted projects, prefers custom production domains, and returns no token', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.includes('/v9/projects?')) {
        return new Response(JSON.stringify({ projects: [
          { id: 'prj_1', name: 'arena', link: { type: 'github', org: 'omkar', repo: 'arena' } },
          { id: 'prj_2', name: 'preview-only' },
        ] }), { status: 200 })
      }
      if (url.includes('/prj_1/domains')) {
        return new Response(JSON.stringify({ domains: [
          { name: 'arena.vercel.app' },
          { name: 'arena.dev' },
          { name: 'feature.arena.dev', gitBranch: 'feature' },
        ] }), { status: 200 })
      }
      return new Response(JSON.stringify({ domains: [
        { name: 'preview-only-git-main.vercel.app', gitBranch: 'main' },
      ] }), { status: 200 })
    })

    const candidates = await fetchVercelPortfolioCandidates(
      'do-not-persist-this-token', 'team_1', fetcher,
    )

    expect(candidates).toEqual([{
      externalId: 'prj_1',
      source: 'vercel',
      title: 'arena',
      description: null,
      liveUrl: 'https://arena.dev',
      repositoryUrl: 'https://github.com/omkar/arena',
    }])
    expect(JSON.stringify(candidates)).not.toContain('do-not-persist-this-token')
    expect(fetcher.mock.calls.every(([, init]) =>
      (init?.headers as Record<string, string>).Authorization === 'Bearer do-not-persist-this-token'))
      .toBe(true)
    expect(fetcher.mock.calls.every(([url]) => String(url).includes('teamId=team_1'))).toBe(true)
  })

  it('throws status-only errors when a provider request fails', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('private response', { status: 403 }))
    await expect(fetchVercelPortfolioCandidates('token', null, fetcher))
      .rejects.toThrow('Vercel import failed (403)')
  })
})
