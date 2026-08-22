import { createHash, timingSafeEqual } from 'node:crypto'
import { vercelProjectToCandidate, type PortfolioCandidate } from '@/lib/portfolio'

export type VercelOAuthConfig = {
  clientId: string
  clientSecret: string
  redirectUri: string
}

type VercelProjectResponse = {
  id?: unknown
  name?: unknown
  link?: { type?: unknown; org?: unknown; repo?: unknown } | null
}

type VercelDomainResponse = {
  name?: unknown
  gitBranch?: unknown
  customEnvironmentId?: unknown
}

export function createVercelAuthorizationUrl(state: string, slug: string): URL {
  const url = new URL(`https://vercel.com/integrations/${encodeURIComponent(slug)}/new`)
  url.searchParams.set('state', state)
  return url
}

export function hashImportState(state: string): string {
  return createHash('sha256').update(state).digest('hex')
}

export function verifyImportState(state: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashImportState(state), 'hex')
  const expected = Buffer.from(expectedHash, 'hex')
  return expected.length === actual.length && timingSafeEqual(actual, expected)
}

export async function exchangeVercelCode(
  code: string,
  config: VercelOAuthConfig,
  fetcher: typeof fetch = fetch,
): Promise<{ accessToken: string; teamId: string | null }> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
  })
  const response = await fetcher('https://api.vercel.com/v2/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!response.ok) throw new Error(`Vercel token exchange failed (${response.status})`)

  const payload = await response.json().catch(() => null) as {
    access_token?: unknown
    team_id?: unknown
  } | null
  if (!payload || typeof payload.access_token !== 'string' || !payload.access_token) {
    throw new Error('Vercel token exchange returned no access token')
  }
  return {
    accessToken: payload.access_token,
    teamId: typeof payload.team_id === 'string' && payload.team_id ? payload.team_id : null,
  }
}

function apiUrl(path: string, teamId: string | null, params: Record<string, string> = {}): URL {
  const url = new URL(path, 'https://api.vercel.com')
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value)
  if (teamId) url.searchParams.set('teamId', teamId)
  return url
}

async function vercelJson(
  url: URL,
  accessToken: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  const response = await fetcher(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) throw new Error(`Vercel import failed (${response.status})`)
  return response.json().catch(() => null)
}

function repositoryUrl(project: VercelProjectResponse): string | null {
  if (project.link?.type !== 'github'
    || typeof project.link.org !== 'string'
    || typeof project.link.repo !== 'string') return null
  return `https://github.com/${project.link.org}/${project.link.repo}`
}

export async function fetchVercelPortfolioCandidates(
  accessToken: string,
  teamId: string | null,
  fetcher: typeof fetch = fetch,
): Promise<PortfolioCandidate[]> {
  const payload = await vercelJson(
    apiUrl('/v9/projects', teamId, { limit: '100' }),
    accessToken,
    fetcher,
  ) as { projects?: unknown } | null
  const projects = Array.isArray(payload?.projects) ? payload.projects as VercelProjectResponse[] : []

  const mapped = await Promise.all(projects.map(async (project) => {
    if (typeof project.id !== 'string' || typeof project.name !== 'string') return null
    const domainsPayload = await vercelJson(
      apiUrl(`/v9/projects/${encodeURIComponent(project.id)}/domains`, teamId, { limit: '100' }),
      accessToken,
      fetcher,
    ) as { domains?: unknown } | null
    const domains = Array.isArray(domainsPayload?.domains)
      ? domainsPayload.domains as VercelDomainResponse[]
      : []
    const productionDomains = domains
      .filter((domain) => !domain.gitBranch && !domain.customEnvironmentId)
      .map((domain) => domain.name)
      .filter((name): name is string => typeof name === 'string')

    return vercelProjectToCandidate({
      id: project.id,
      name: project.name,
      productionDomains,
      repositoryUrl: repositoryUrl(project),
    })
  }))

  const seen = new Set<string>()
  return mapped.filter((candidate): candidate is PortfolioCandidate => {
    if (!candidate || seen.has(candidate.liveUrl)) return false
    seen.add(candidate.liveUrl)
    return true
  })
}
