import Link from 'next/link'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { db } from '@/db/client'
import { users } from '@/db/schema'
import { PortfolioManager } from '@/components/PortfolioManager'
import { getImportSession, listPortfolioProjects } from '@/lib/portfolio-store'
import type { PortfolioCandidate } from '@/lib/portfolio'
import {
  addManual,
  editProject,
  publishImportSelection,
  removeProject,
  reorderProjects,
  startGitHubImport,
} from './actions'

export const dynamic = 'force-dynamic'

export default async function PortfolioSettings({
  searchParams,
}: {
  searchParams: Promise<{ import?: string; error?: string; notice?: string }>
}) {
  const session = await auth()
  const handle = (session?.user as { handle?: string } | undefined)?.handle
  if (!handle) redirect('/api/auth/signin')

  const [user] = await db.select().from(users).where(eq(users.handle, handle))
  if (!user) redirect('/api/auth/signin')

  const query = await searchParams
  const projects = await listPortfolioProjects(db, user.id)
  const rawImport = query.import
    ? await getImportSession(db, user.id, query.import)
    : null
  const importSession = rawImport ? {
    id: rawImport.id,
    source: rawImport.source,
    candidates: rawImport.candidates as PortfolioCandidate[],
  } : null

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/settings" className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary">
        ← Settings
      </Link>
      <header className="mt-6 border-b border-border pb-7">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-primary">AI MAXXING / PORTFOLIO</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Show what you shipped.</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          Pick the websites that represent you. Your AI usage stays account-level; these are simply links to your live work.
        </p>
      </header>

      <div className="mt-9">
        <PortfolioManager
          projects={projects}
          importSession={importSession}
          message={query.error ?? query.notice ?? null}
          vercelConfigured={Boolean(
            process.env.VERCEL_INTEGRATION_ID
            && process.env.VERCEL_INTEGRATION_CLIENT_SECRET
            && process.env.VERCEL_INTEGRATION_SLUG
          )}
          actions={{
            addManual,
            editProject,
            removeProject,
            reorderProjects,
            startGitHubImport,
            publishImportSelection,
          }}
        />
      </div>
    </main>
  )
}
