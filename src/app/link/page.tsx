import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db/client'
import { ReporterApproval } from '@/components/ReporterApproval'
import { getReporterApproval } from '@/lib/reporter-link'
import { decideReporterLink } from './actions'

export const dynamic = 'force-dynamic'

export default async function LinkReporterPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; error?: string; notice?: string }>
}) {
  const query = await searchParams
  const code = String(query.code ?? '').trim().toUpperCase()
  const session = await auth()
  if (!(session?.user as { handle?: string } | undefined)?.handle) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(`/link?code=${code}`)}`)
  }
  const link = code ? await getReporterApproval(db, code) : null

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      {(query.error || query.notice) && (
        <p className="mb-5 border border-primary/40 bg-primary/10 px-4 py-3 text-sm" role="status">
          {query.error ?? query.notice}
        </p>
      )}
      {query.notice === 'Device approved' ? (
        <section className="border border-live/40 bg-live/10 p-6" role="status">
          <h1 className="text-2xl font-semibold">Device approved</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Return to the terminal. The reporter will finish linking and send only the aggregate you reviewed.
          </p>
        </section>
      ) : link ? (
        <ReporterApproval link={link} action={decideReporterLink} />
      ) : (
        <section className="border border-border p-6">
          <h1 className="text-2xl font-semibold">Reporter link unavailable</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            The code is invalid, expired, denied, or already consumed. Return to the terminal and start again.
          </p>
        </section>
      )}
    </main>
  )
}
