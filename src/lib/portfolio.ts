export type PortfolioSource = 'github' | 'vercel' | 'manual'

export type PortfolioCandidate = {
  externalId: string
  source: Exclude<PortfolioSource, 'manual'>
  title: string
  description: string | null
  liveUrl: string
  repositoryUrl: string | null
}

export type GitHubRepo = {
  id: number | string
  name: string
  description: string | null
  homepage: string | null
  html_url: string
  fork: boolean
  archived: boolean
  disabled: boolean
}

export type VercelProject = {
  id: string
  name: string
  productionDomains: string[]
  repositoryUrl?: string | null
}

export type ManualProjectInput = {
  title: string
  description?: string
  liveUrl: string
  repositoryUrl?: string
}

export type ManualProject = {
  title: string
  description: string | null
  liveUrl: string
  repositoryUrl: string | null
}

export type ValidationResult =
  | { ok: true; value: ManualProject }
  | { ok: false; errors: Partial<Record<keyof ManualProjectInput, string>> }

function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return host === 'localhost'
    || host.endsWith('.localhost')
    || host === '[::1]'
    || host === '::1'
    || /^127(?:\.\d{1,3}){3}$/.test(host)
}

export function normalizeLiveUrl(input: string): string | null {
  const raw = (input ?? '').trim()
  if (!raw) return null

  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.username || url.password || !url.hostname || isLocalHostname(url.hostname)) return null

    url.hash = ''
    if (url.pathname === '/' && !url.search) {
      return `${url.protocol}//${url.host}`
    }
    return url.toString()
  } catch {
    return null
  }
}

export function normalizeRepositoryUrl(input: string): string | null {
  const normalized = normalizeLiveUrl(input)
  if (!normalized) return null
  const url = new URL(normalized)
  if (url.hostname !== 'github.com') return null
  return normalized
}

function cleanText(value: string | null | undefined, limit: number): string | null {
  const cleaned = (value ?? '').trim()
  return cleaned ? cleaned.slice(0, limit) : null
}

export function githubRepoToCandidate(repo: GitHubRepo): PortfolioCandidate | null {
  if (repo.fork || repo.archived || repo.disabled) return null
  const liveUrl = normalizeLiveUrl(repo.homepage ?? '')
  const repositoryUrl = normalizeRepositoryUrl(repo.html_url)
  const title = cleanText(repo.name, 80)
  if (!liveUrl || !repositoryUrl || !title) return null

  return {
    externalId: String(repo.id),
    source: 'github',
    title,
    description: cleanText(repo.description, 180),
    liveUrl,
    repositoryUrl,
  }
}

function domainToUrl(domain: string): string | null {
  const trimmed = (domain ?? '').trim()
  if (!trimmed) return null
  return normalizeLiveUrl(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
}

export function vercelProjectToCandidate(project: VercelProject): PortfolioCandidate | null {
  const urls = project.productionDomains.map(domainToUrl).filter((url): url is string => Boolean(url))
  const liveUrl = urls.find((url) => !new URL(url).hostname.endsWith('.vercel.app')) ?? urls[0]
  const title = cleanText(project.name, 80)
  if (!liveUrl || !title) return null

  return {
    externalId: project.id,
    source: 'vercel',
    title,
    description: null,
    liveUrl,
    repositoryUrl: project.repositoryUrl ? normalizeRepositoryUrl(project.repositoryUrl) : null,
  }
}

export function validateManualProject(input: ManualProjectInput): ValidationResult {
  const errors: Partial<Record<keyof ManualProjectInput, string>> = {}
  const title = (input.title ?? '').trim()
  const description = (input.description ?? '').trim()
  const liveUrl = normalizeLiveUrl(input.liveUrl)
  const repositoryInput = (input.repositoryUrl ?? '').trim()
  const repositoryUrl = repositoryInput ? normalizeRepositoryUrl(repositoryInput) : null

  if (title.length < 1 || title.length > 80) {
    errors.title = 'Enter a title between 1 and 80 characters.'
  }
  if (description.length > 180) {
    errors.description = 'Keep the description to 180 characters or fewer.'
  }
  if (!liveUrl) {
    errors.liveUrl = 'Enter a public http or https URL.'
  }
  if (repositoryInput && !repositoryUrl) {
    errors.repositoryUrl = 'Enter a GitHub repository URL.'
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: {
      title,
      description: description || null,
      liveUrl: liveUrl!,
      repositoryUrl,
    },
  }
}
