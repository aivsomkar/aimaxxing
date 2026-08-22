import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { setPublicOptIn, deleteAllData, saveXHandle } from './actions'
import Link from 'next/link'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { users } from '@/db/schema'
import { SocialSettings } from '@/components/SocialSettings'

export default async function Settings({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>
}) {
  // No middleware.ts guards this route; anonymous visitors would otherwise hit
  // setPublicOptIn/deleteAllData's 'unauthenticated' throw and see a raw error page.
  const session = await auth()
  const handle = (session?.user as { handle?: string } | undefined)?.handle
  if (!handle) redirect('/api/auth/signin')
  const [user] = await db.select().from(users).where(eq(users.handle, handle))
  if (!user) redirect('/api/auth/signin')
  const query = await searchParams

  return (
    <main className="mx-auto max-w-2xl p-8 space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      {(query.error || query.notice) && (
        <p className="border border-primary/40 bg-primary/10 px-4 py-3 text-sm" role="status">
          {query.error ?? query.notice}
        </p>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">Public board</h2>
        <p className="text-sm opacity-70">
          Your data is private until you turn this on. Signing in does not list you.
        </p>
        <form action={async () => { 'use server'; await setPublicOptIn(true) }}>
          <button className="rounded-[--radius] bg-primary px-4 py-2 text-primary-foreground">List me publicly</button>
        </form>
        <form action={async () => { 'use server'; await setPublicOptIn(false) }}>
          <button className="rounded border px-4 py-2">Remove me from public boards</button>
        </form>
      </section>

      <SocialSettings xHandle={user.xHandle} onSave={saveXHandle} />

      <section className="space-y-2">
        <h2 className="font-semibold">Portfolio</h2>
        <p className="text-sm opacity-70">
          Select the live websites you want to showcase beside your AI usage.
        </p>
        <Link className="inline-block rounded-[--radius] bg-primary px-4 py-2 text-primary-foreground" href="/settings/portfolio">
          Manage live projects
        </Link>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Delete everything</h2>
        <p className="text-sm opacity-70">Removes all reported usage and unlists you. Irreversible.</p>
        <form action={async () => { 'use server'; await deleteAllData() }}>
          <button className="rounded border border-destructive px-4 py-2 text-destructive">Delete my data</button>
        </form>
      </section>
    </main>
  )
}
