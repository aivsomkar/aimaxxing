import { describe, expect, it } from 'vitest'
import { githubIdFromToken, persistGitHubId, viewerFromSession } from '../src/lib/auth-session'

describe('GitHub session identity', () => {
  it('persists the provider account ID instead of the unrelated Auth.js subject', () => {
    const token = persistGitHubId(
      { sub: '4ef25b52-c7df-44e3-9b63-58ee0996cdcc' },
      { provider: 'github', providerAccountId: '12345678' },
    )

    expect(githubIdFromToken(token)).toBe('12345678')
  })

  it('keeps the GitHub ID on later JWT refreshes when no account is supplied', () => {
    const token = persistGitHubId(
      { sub: '4ef25b52-c7df-44e3-9b63-58ee0996cdcc', githubId: '12345678' },
      null,
    )

    expect(githubIdFromToken(token)).toBe('12345678')
  })

  it('never treats the Auth.js subject as a GitHub ID', () => {
    expect(githubIdFromToken({ sub: '12345678' })).toBeNull()
  })

  it('exposes only the profile fields needed by client navigation', () => {
    expect(viewerFromSession({
      user: { handle: 'aivsomkar', publicOptIn: false, email: 'private@example.com' },
    })).toEqual({ handle: 'aivsomkar', publicOptIn: false })
    expect(viewerFromSession(null)).toBeNull()
  })
})
