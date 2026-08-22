type SessionToken = Record<string, unknown>
type ProviderAccount = { provider: string; providerAccountId: string }

export type SessionViewer = {
  handle: string
  publicOptIn: boolean
}

export function persistGitHubId(
  token: SessionToken,
  account: ProviderAccount | null | undefined,
): SessionToken {
  if (account?.provider !== 'github' || !account.providerAccountId) return token
  return { ...token, githubId: account.providerAccountId }
}

export function githubIdFromToken(token: SessionToken): string | null {
  return typeof token.githubId === 'string' && token.githubId.length > 0
    ? token.githubId
    : null
}

export function viewerFromSession(session: unknown): SessionViewer | null {
  if (!session || typeof session !== 'object' || !('user' in session)) return null
  const user = session.user
  if (!user || typeof user !== 'object' || !('handle' in user)) return null
  if (typeof user.handle !== 'string' || user.handle.length === 0) return null
  const publicOptIn = 'publicOptIn' in user && user.publicOptIn === true
  return { handle: user.handle, publicOptIn }
}
