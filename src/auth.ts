import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import { eq } from 'drizzle-orm'
import { db } from './db/client'
import { users } from './db/schema'
import { deriveHandle } from './lib/handle'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  callbacks: {
    async signIn({ profile }) {
      if (!profile?.id) return false
      const githubId = String(profile.id)
      const existing = await db.select().from(users).where(eq(users.githubId, githubId))
      if (existing.length > 0) return true
      const all = await db.select({ handle: users.handle }).from(users)
      const handle = deriveHandle(String(profile.login ?? 'dev'), new Set(all.map((u) => u.handle)))
      // public_opt_in stays false: signing in is not consent to be listed.
      await db.insert(users).values({
        githubId, handle, avatarUrl: (profile.avatar_url as string) ?? null,
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
