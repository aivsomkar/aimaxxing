import { githubStats } from '@/db/schema'

export type GitHubOutput = {
  mergedPrs: number
  activeRepos: number
  contributions: number
}

export type GitHubOutputErrorCode = 'http' | 'graphql' | 'invalid_response'

export class GitHubOutputError extends Error {
  constructor(public readonly code: GitHubOutputErrorCode, status?: number) {
    super(status === undefined ? `GitHub output sync failed (${code})` : `GitHub output sync failed (${code}:${status})`)
    this.name = 'GitHubOutputError'
  }
}

type Database = {
  insert: (...args: any[]) => any
}

type GitHubResponse = {
  data?: {
    search?: { issueCount?: unknown }
    viewer?: {
      contributionsCollection?: {
        contributionCalendar?: { totalContributions?: unknown }
      }
      repositories?: {
        nodes?: unknown
      }
    } | null
  }
  errors?: unknown
}

const OUTPUT_QUERY = `
  query AImaxxingOutput($mergedQuery: String!) {
    search(query: $mergedQuery, type: ISSUE) { issueCount }
    viewer {
      contributionsCollection {
        contributionCalendar { totalContributions }
        restrictedContributionsCount
      }
      repositories(first: 100, ownerAffiliations: OWNER, orderBy: { field: PUSHED_AT, direction: DESC }) {
        nodes { isArchived pushedAt }
      }
    }
  }
`

function count(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new GitHubOutputError('invalid_response')
  }
  return value as number
}

export async function fetchGitHubOutput(
  accessToken: string,
  login: string,
  now: Date = new Date(),
  fetcher: typeof fetch = fetch,
): Promise<GitHubOutput> {
  let response: Response
  try {
    response = await fetcher('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'aimaxxing',
        'X-GitHub-Api-Version': '2026-03-10',
      },
      body: JSON.stringify({
        query: OUTPUT_QUERY,
        variables: { mergedQuery: `is:pr is:merged author:${login}` },
      }),
    })
  } catch {
    throw new GitHubOutputError('http')
  }

  if (!response.ok) throw new GitHubOutputError('http', response.status)

  let payload: GitHubResponse
  try {
    payload = await response.json() as GitHubResponse
  } catch {
    throw new GitHubOutputError('invalid_response')
  }
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    throw new GitHubOutputError('graphql')
  }

  const viewer = payload.data?.viewer
  const repositories = viewer?.repositories?.nodes
  if (!viewer || !Array.isArray(repositories)) {
    throw new GitHubOutputError('invalid_response')
  }

  const cutoff = now.getTime() - 90 * 24 * 60 * 60 * 1000
  let activeRepos = 0
  for (const repository of repositories) {
    if (!repository || typeof repository !== 'object') {
      throw new GitHubOutputError('invalid_response')
    }
    const row = repository as { isArchived?: unknown; pushedAt?: unknown }
    if (typeof row.isArchived !== 'boolean' || typeof row.pushedAt !== 'string') {
      throw new GitHubOutputError('invalid_response')
    }
    const pushedAt = Date.parse(row.pushedAt)
    if (!Number.isFinite(pushedAt)) throw new GitHubOutputError('invalid_response')
    if (!row.isArchived && pushedAt >= cutoff) activeRepos += 1
  }

  return {
    mergedPrs: count(payload.data?.search?.issueCount),
    activeRepos,
    contributions: count(viewer.contributionsCollection?.contributionCalendar?.totalContributions),
  }
}

export async function upsertGitHubOutput(
  database: Database,
  userId: number,
  output: GitHubOutput,
  syncedAt: Date = new Date(),
): Promise<void> {
  await database.insert(githubStats).values({ userId, ...output, syncedAt })
    .onConflictDoUpdate({
      target: githubStats.userId,
      set: { ...output, syncedAt },
    })
}

export function safeGitHubError(error: unknown): { code: string } {
  return { code: error instanceof GitHubOutputError ? error.code : 'unknown' }
}
