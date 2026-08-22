import { githubRepoToCandidate, type GitHubRepo, type PortfolioCandidate } from '@/lib/portfolio'

type GitHubProfile = {
  id?: unknown
  login?: unknown
  avatar_url?: unknown
}

export function githubIdentityFromProfile(profile: GitHubProfile) {
  if (profile.id === undefined || profile.id === null || String(profile.id) === '') return null
  const githubLogin = typeof profile.login === 'string' && profile.login.trim()
    ? profile.login.trim()
    : null
  const avatarUrl = typeof profile.avatar_url === 'string' && profile.avatar_url.trim()
    ? profile.avatar_url.trim()
    : null
  return {
    githubId: String(profile.id),
    githubLogin,
    avatarUrl,
  }
}

export async function fetchGitHubPortfolioCandidates(
  login: string,
  fetcher: typeof fetch = fetch,
): Promise<PortfolioCandidate[]> {
  const url = `https://api.github.com/users/${encodeURIComponent(login)}/repos?type=owner&sort=updated&per_page=100`
  const response = await fetcher(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2026-03-10',
    },
  })
  if (!response.ok) throw new Error(`GitHub import failed (${response.status})`)

  const payload: unknown = await response.json()
  if (!Array.isArray(payload)) throw new Error('GitHub import returned an invalid response')

  const seen = new Set<string>()
  const candidates: PortfolioCandidate[] = []
  for (const row of payload) {
    const candidate = githubRepoToCandidate(row as GitHubRepo)
    if (!candidate || seen.has(candidate.liveUrl)) continue
    seen.add(candidate.liveUrl)
    candidates.push(candidate)
  }
  return candidates
}
