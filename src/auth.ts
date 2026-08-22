import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import { eq } from 'drizzle-orm'
import { db } from './db/client'
import { users } from './db/schema'
import { provisionGitHubAccount } from './lib/auth-account'
import { githubIdFromToken, persistGitHubId } from './lib/auth-session'
import { fetchGitHubOutput, safeGitHubError, upsertGitHubOutput } from './lib/github-output'
import { githubIdentityFromProfile } from './lib/github-portfolio'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub({ authorization: { params: { scope: 'read:user' } } })],
  pages: { signIn: '/signin' },
  callbacks: {
    jwt({ token, account }) {
      return persistGitHubId(token, account)
    },
    async signIn({ profile, account }) {
      const identity = githubIdentityFromProfile(profile ?? {})
      if (!identity) return false
      const user = await provisionGitHubAccount(db, identity)
      if (account?.access_token && identity.githubLogin) {
        try {
          const output = await fetchGitHubOutput(account.access_token, identity.githubLogin)
          await upsertGitHubOutput(db, user.id, output)
        } catch (error) {
          console.error('github_output_sync_failed', safeGitHubError(error))
        }
      }
      return true
    },
    async session({ session, token }) {
      const githubId = githubIdFromToken(token)
      if (!githubId) return session
      const rows = await db.select().from(users).where(eq(users.githubId, githubId))
      if (rows[0]) {
        ;(session.user as any).handle = rows[0].handle
        ;(session.user as any).publicOptIn = rows[0].publicOptIn
      }
      return session
    },
  },
})
