import { describe, expect, it } from 'vitest'
import {
  githubRepoToCandidate,
  normalizeLiveUrl,
  normalizeRepositoryUrl,
  validateManualProject,
  vercelProjectToCandidate,
} from '../src/lib/portfolio'

describe('normalizeLiveUrl', () => {
  it('normalizes the host, strips fragments, and removes only a root slash', () => {
    expect(normalizeLiveUrl('HTTPS://Example.COM/#work')).toBe('https://example.com')
    expect(normalizeLiveUrl('https://Example.com/app/?ref=profile#work'))
      .toBe('https://example.com/app/?ref=profile')
  })

  it('rejects credentials, non-web protocols, and local addresses', () => {
    expect(normalizeLiveUrl('https://user:pass@example.com')).toBeNull()
    expect(normalizeLiveUrl('ftp://example.com/site')).toBeNull()
    expect(normalizeLiveUrl('http://localhost:3000')).toBeNull()
    expect(normalizeLiveUrl('http://127.0.0.1:3000')).toBeNull()
    expect(normalizeLiveUrl('http://[::1]:3000')).toBeNull()
  })

  it('returns null for malformed or empty input', () => {
    expect(normalizeLiveUrl('')).toBeNull()
    expect(normalizeLiveUrl('not a url')).toBeNull()
  })
})

describe('normalizeRepositoryUrl', () => {
  it('accepts only GitHub web URLs', () => {
    expect(normalizeRepositoryUrl('https://github.com/Omkar/Arena'))
      .toBe('https://github.com/Omkar/Arena')
    expect(normalizeRepositoryUrl('https://gitlab.com/omkar/arena')).toBeNull()
    expect(normalizeRepositoryUrl('git@github.com:omkar/arena.git')).toBeNull()
  })
})

describe('githubRepoToCandidate', () => {
  const repo = {
    id: 42,
    name: 'arena',
    description: 'Public proof',
    homepage: 'https://arena.dev/',
    html_url: 'https://github.com/omkar/arena',
    fork: false,
    archived: false,
    disabled: false,
  }

  it('maps a public repository with a live homepage', () => {
    expect(githubRepoToCandidate(repo)).toEqual({
      externalId: '42',
      source: 'github',
      title: 'arena',
      description: 'Public proof',
      liveUrl: 'https://arena.dev',
      repositoryUrl: 'https://github.com/omkar/arena',
    })
  })

  it('rejects forks, archived or disabled repositories, and missing homepages', () => {
    expect(githubRepoToCandidate({ ...repo, fork: true })).toBeNull()
    expect(githubRepoToCandidate({ ...repo, archived: true })).toBeNull()
    expect(githubRepoToCandidate({ ...repo, disabled: true })).toBeNull()
    expect(githubRepoToCandidate({ ...repo, homepage: null })).toBeNull()
  })

  it('trims imported copy to public field limits', () => {
    const result = githubRepoToCandidate({
      ...repo,
      name: `  ${'n'.repeat(100)}  `,
      description: `  ${'d'.repeat(220)}  `,
    })
    expect(result?.title).toHaveLength(80)
    expect(result?.description).toHaveLength(180)
  })
})

describe('vercelProjectToCandidate', () => {
  it('prefers a custom production domain over a vercel.app alias', () => {
    expect(vercelProjectToCandidate({
      id: 'prj_1',
      name: 'arena',
      productionDomains: ['arena.vercel.app', 'arena.dev'],
    })).toEqual({
      externalId: 'prj_1',
      source: 'vercel',
      title: 'arena',
      description: null,
      liveUrl: 'https://arena.dev',
      repositoryUrl: null,
    })
  })

  it('uses a vercel.app alias when it is the only production domain', () => {
    expect(vercelProjectToCandidate({
      id: 'prj_2',
      name: 'solo',
      productionDomains: ['solo.vercel.app'],
    })?.liveUrl).toBe('https://solo.vercel.app')
  })

  it('rejects projects without a usable production domain', () => {
    expect(vercelProjectToCandidate({ id: 'prj_3', name: 'empty', productionDomains: [] }))
      .toBeNull()
  })
})

describe('validateManualProject', () => {
  it('returns normalized public fields for a valid manual site', () => {
    expect(validateManualProject({
      title: '  Arena  ',
      description: '  Public proof  ',
      liveUrl: 'https://Arena.dev/',
      repositoryUrl: 'https://github.com/omkar/arena',
    })).toEqual({
      ok: true,
      value: {
        title: 'Arena',
        description: 'Public proof',
        liveUrl: 'https://arena.dev',
        repositoryUrl: 'https://github.com/omkar/arena',
      },
    })
  })

  it('returns field errors without a partial value', () => {
    expect(validateManualProject({
      title: '',
      description: 'd'.repeat(181),
      liveUrl: 'javascript:alert(1)',
      repositoryUrl: 'https://gitlab.com/omkar/arena',
    })).toEqual({
      ok: false,
      errors: {
        title: 'Enter a title between 1 and 80 characters.',
        description: 'Keep the description to 180 characters or fewer.',
        liveUrl: 'Enter a public http or https URL.',
        repositoryUrl: 'Enter a GitHub repository URL.',
      },
    })
  })
})
