import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import {
  setPublicOptIn,
  deleteAllData,
  saveXHandle,
  revokeUsageReporter,
  deleteUsageReporterData,
} from './actions'
import { db } from '@/db/client'
import { SocialSettings } from '@/components/SocialSettings'
import { AccountDashboard } from '@/components/AccountDashboard'
import { getAccountStatusForHandle } from '@/lib/account-status'
import { ReporterSettings } from '@/components/ReporterSettings'

export default async function Settings({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>
}) {
  // No middleware.ts guards this route; anonymous visitors would otherwise hit
  // setPublicOptIn/deleteAllData's 'unauthenticated' throw and see a raw error page.
  const session = await auth()
  const handle = (session?.user as { handle?: string } | undefined)?.handle
  if (!handle) redirect('/signin?callbackUrl=/settings')
  const status = await getAccountStatusForHandle(db, handle)
  if (!status) redirect('/signin?callbackUrl=/settings')
  const query = await searchParams

  async function publish() {
    'use server'
    await setPublicOptIn(true)
  }

  async function unpublish() {
    'use server'
    await setPublicOptIn(false)
  }

  return (
    <main className="mx-auto max-w-2xl p-8 space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      {(query.error || query.notice) && (
        <p className="border border-primary/40 bg-primary/10 px-4 py-3 text-sm" role="status">
          {query.error ?? query.notice}
        </p>
      )}

      <AccountDashboard status={status} onPublish={publish} onUnpublish={unpublish} />

      <ReporterSettings
        reporters={status.reporters}
        onRevoke={revokeUsageReporter}
        onDeleteData={deleteUsageReporterData}
      />

      <SocialSettings xHandle={status.xHandle} onSave={saveXHandle} />

      <section className="space-y-2">
        <h2 className="font-semibold">Delete everything</h2>
        <p className="text-sm opacity-70">
          Removes manual and verified usage, linked reporter identities, selected websites, social handles,
          private imports, and GitHub output.
          Type <strong>{status.handle}</strong> to confirm. This cannot be undone.
        </p>
        <form action={deleteAllData} className="flex max-w-lg flex-col gap-3 sm:flex-row">
          <label className="sr-only" htmlFor="delete-confirmation">Type your handle to confirm deletion</label>
          <input
            id="delete-confirmation"
            name="confirmation"
            required
            autoComplete="off"
            className="min-h-11 min-w-0 flex-1 border border-input bg-background px-3 font-mono text-sm"
            placeholder={status.handle}
          />
          <button className="min-h-11 border border-destructive px-4 text-destructive">Delete my data</button>
        </form>
      </section>
    </main>
  )
}
