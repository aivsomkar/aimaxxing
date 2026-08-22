import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { submitManualReport } from './actions'
import { ManualReportForm } from '@/components/ManualReportForm'
import { UsageImportPanel } from '@/components/UsageImportPanel'

export default async function Report() {
  // No middleware.ts guards this route; anonymous visitors would otherwise hit
  // submitManualReport's 'unauthenticated' throw and see a raw Next.js error page.
  const session = await auth()
  const handle = (session?.user as { handle?: string } | undefined)?.handle
  if (!handle) redirect('/signin?callbackUrl=/report')

  return (
    <main className="mx-auto max-w-2xl space-y-7 px-6 py-12">
      <header className="border-b border-border pb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-primary">AI MAXXING / USAGE</p>
        <h1 className="mt-2 text-3xl font-bold">Import AI usage</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          Import directly from your local AI tools for a verified profile, or enter a self-reported snapshot manually.
        </p>
      </header>

      <UsageImportPanel />

      <details className="border-t border-border pt-6">
        <summary className="min-h-11 cursor-pointer font-semibold marker:text-primary">
          Enter usage manually instead
        </summary>
        <p className="mb-6 mt-2 text-sm leading-6 text-muted-foreground">
          Manual entries carry a self-reported badge, sort below verified entries, and are excluded
          from the verified model breakdown on the homepage.
        </p>
        <ManualReportForm handle={handle} action={submitManualReport} />
      </details>
    </main>
  )
}
