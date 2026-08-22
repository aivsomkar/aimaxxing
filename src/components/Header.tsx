import Link from 'next/link'

export function Header() {
  return (
    <header className="border-b border-border">
      <nav className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4 text-sm">
        <Link href="/" className="font-mono font-semibold">
          aimaxxing<span className="text-primary">.lol</span>
        </Link>
        <div className="flex gap-6 text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            Leaderboard
          </Link>
          <Link href="/methodology" className="hover:text-foreground">
            Methodology
          </Link>
          <Link href="/report" className="hover:text-foreground">
            Add me
          </Link>
        </div>
      </nav>
    </header>
  )
}
