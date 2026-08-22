import * as React from 'react'
import Link from 'next/link'

export type HeaderViewer = {
  handle: string
  publicOptIn: boolean
}

type FormAction = () => void | Promise<void>

const linkClass = 'inline-flex min-h-11 items-center px-1 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

export function HeaderNav({
  viewer,
  onSignOut,
}: {
  viewer: HeaderViewer | null
  onSignOut?: FormAction
}) {
  return (
    <nav aria-label="Primary" className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-x-5 gap-y-2 px-6 py-2 text-sm">
      <Link href="/" className="inline-flex min-h-11 items-center font-mono font-semibold">
        aimaxxing<span className="text-primary">.lol</span>
      </Link>
      <div className="flex flex-wrap items-center justify-end gap-x-4 text-muted-foreground sm:gap-x-6">
        <Link href="/" className={linkClass}>Leaderboard</Link>
        <Link href="/methodology" className={linkClass}>Methodology</Link>
        {viewer ? (
          <>
            <Link href={`/@${viewer.handle}`} className={linkClass}>@{viewer.handle}</Link>
            <Link href="/settings" className={linkClass}>Settings</Link>
            <form action={onSignOut}>
              <button className={`${linkClass} cursor-pointer bg-transparent`} type="submit">Sign out</button>
            </form>
          </>
        ) : (
          <Link href="/signin" className={`${linkClass} text-foreground`}>Sign in</Link>
        )}
      </div>
    </nav>
  )
}
