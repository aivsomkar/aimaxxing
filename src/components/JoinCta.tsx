'use client'

import * as React from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { viewerFromSession } from '@/lib/auth-session'

const STEPS = [
  {
    n: '1',
    title: 'Sign in with GitHub',
    body: 'Takes a second, and it does not publish anything.',
  },
  {
    n: '2',
    title: 'Link your usage',
    body: 'Run npx aimaxxing@latest link to report verified usage, or enter it by hand.',
  },
  {
    n: '3',
    title: 'Publish when ready',
    body: 'Preview your card privately first. You decide when you appear on the board.',
  },
] as const

/**
 * The homepage had no invitation of any kind: the only way in was a small
 * "Sign in" link in the nav corner, which renders only after the session
 * resolves client-side. A visitor saw one person's numbers and no way to join.
 */
export function JoinCtaContent() {
  return (
    <section className="mb-12 border border-border bg-card p-6 sm:p-8" aria-labelledby="join-title">
      <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">Get on the board</p>
      <h2 id="join-title" className="mt-2 text-2xl font-bold tracking-tight">
        Add your stack
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
        Publish what you actually run and what it actually costs. Verified from your own
        machine — no screenshots, no self-reported guesses.
      </p>

      <ol className="mt-6 grid gap-4 sm:grid-cols-3">
        {STEPS.map((step) => (
          <li key={step.n} className="border-t border-border pt-3">
            <span className="font-mono tabular-nums text-xs text-primary">{step.n}</span>
            <p className="mt-1 font-medium">{step.title}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>

      <Link
        href="/signin"
        className="mt-7 inline-flex min-h-11 items-center bg-primary px-5 py-3 font-semibold text-primary-foreground"
      >
        Continue with GitHub
      </Link>
    </section>
  )
}

/**
 * Rendered by default rather than hidden until the session resolves: logged-out
 * is the common case for a public leaderboard, crawlers and social previews see
 * the invitation, and there is no flash of missing content. It disappears only
 * once we positively know the viewer is signed in.
 */
export function JoinCta() {
  const { data: session } = useSession()
  if (viewerFromSession(session)) return null
  return <JoinCtaContent />
}
