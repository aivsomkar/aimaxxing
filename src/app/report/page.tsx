import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { submitManualReport } from './actions'
import { ManualReportForm } from '@/components/ManualReportForm'

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
        <h1 className="mt-2 text-3xl font-bold">Add usage manually</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
        Manual entries carry a self-reported badge, sort below verified entries, and are excluded
        from the model breakdown on the homepage.
        </p>
      </header>
      <ManualReportForm handle={handle} action={submitManualReport} />
    </main>
  )
}
