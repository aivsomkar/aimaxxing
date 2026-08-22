import { redirect } from 'next/navigation'
import { auth, signIn } from '@/auth'

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const query = await searchParams
  const requested = query.callbackUrl ?? '/settings'
  const redirectTo = requested.startsWith('/') && !requested.startsWith('//')
    ? requested
    : '/settings'
  const session = await auth()
  if ((session?.user as { handle?: string } | undefined)?.handle) redirect(redirectTo)

  async function login() {
    'use server'
    await signIn('github', { redirectTo })
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-xl items-center px-6 py-16">
      <section className="w-full border border-border bg-card p-8 sm:p-10" aria-labelledby="signin-title">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">Your public build record</p>
        <h1 id="signin-title" className="mt-3 text-3xl font-bold tracking-tight">Build your AI Maxxing profile</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Sign in with GitHub to select your live websites, connect AI usage, add your X handle,
          preview your card privately, and publish only when you choose.
        </p>
        <form action={login} className="mt-7">
          <button className="min-h-11 w-full bg-primary px-5 py-3 font-semibold text-primary-foreground">
            Continue with GitHub
          </button>
        </form>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          Signing in does not publish your profile or add you to the leaderboard.
        </p>
      </section>
    </main>
  )
}
