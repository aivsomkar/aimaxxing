import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import { eq } from 'drizzle-orm'
import { db } from './db/client'
import { users } from './db/schema'
import { deriveHandle } from './lib/handle'
import { githubIdentityFromProfile } from './lib/github-portfolio'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  callbacks: {
    async signIn({ profile }) {
      const identity = githubIdentityFromProfile(profile ?? {})
      if (!identity) return false
      const existing = await db.select().from(users).where(eq(users.githubId, identity.githubId))
      if (existing.length > 0) {
        await db.update(users).set({
          githubLogin: identity.githubLogin,
          avatarUrl: identity.avatarUrl,
        }).where(eq(users.githubId, identity.githubId))
        return true
      }
      const all = await db.select({ handle: users.handle }).from(users)
      const handle = deriveHandle(identity.githubLogin ?? 'dev', new Set(all.map((u) => u.handle)))
      // public_opt_in stays false: signing in is not consent to be listed.
      await db.insert(users).values({
        githubId: identity.githubId,
        githubLogin: identity.githubLogin,
        handle,
        avatarUrl: identity.avatarUrl,
      })
      return true
    },
    async session({ session, token }) {
      const rows = await db.select().from(users).where(eq(users.githubId, String(token.sub)))
      if (rows[0]) {
        ;(session.user as any).handle = rows[0].handle
        ;(session.user as any).publicOptIn = rows[0].publicOptIn
      }
      return session
    },
  },
})
