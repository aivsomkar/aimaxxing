import * as React from 'react'
import Link from 'next/link'
import type { AccountStatus } from '@/lib/account-status'

type FormAction = () => void | Promise<void>

export function AccountDashboard({
  status,
  onPublish,
  onUnpublish,
}: {
  status: AccountStatus
  onPublish?: FormAction
  onUnpublish?: FormAction
}) {
  const outputTotal = status.output.mergedPrs + status.output.activeRepos + status.output.contributions

  return (
    <div className="space-y-8">
      <section className="border border-border bg-card p-5 sm:p-6" aria-labelledby="account-state-heading">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">Account status</p>
            <h2 id="account-state-heading" className="mt-1 text-xl font-semibold">
              {status.state === 'public' ? 'Your profile is live' : 'Your profile is private'}
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
              {status.state === 'private-empty'
                ? 'Add a live website, AI usage, or GitHub output before publishing.'
                : status.state === 'private-ready'
                  ? 'Your profile has something to show. Preview it, then publish when ready.'
                  : 'Anyone with your link can view and share your AI Maxxing profile.'}
            </p>
          </div>
          <Link className="inline-flex min-h-11 shrink-0 items-center border border-border px-4 text-sm font-semibold hover:border-primary hover:text-primary" href={`/@${status.handle}`}>
            {status.publicOptIn ? 'View profile' : 'Private preview'}
          </Link>
        </div>
      </section>

      <ol className="grid gap-4" aria-label="Profile activation steps">
        <Step number="01" title="GitHub connected" complete>
          {status.githubSyncedAt
            ? `Output last synced ${status.githubSyncedAt.toLocaleDateString()}: ${status.output.mergedPrs} merged PRs, ${status.output.activeRepos} active repositories, and ${status.output.contributions} contributions.`
            : 'Your account is connected. Sign in again to retry the private GitHub output sync.'}
        </Step>
        <Step number="02" title="Show live work" complete={status.projectCount > 0}>
          <span>{status.projectCount === 1 ? '1 live website' : `${status.projectCount} live websites`} selected. </span>
          <Link className="font-semibold text-primary underline underline-offset-4" href="/settings/portfolio">
            Manage websites
          </Link>
        </Step>
        <Step number="03" title="Connect AI usage" complete={status.usageCount > 0 || status.connectedReporterCount > 0}>
          <span>
            {status.usageCount === 1 ? '1 usage entry' : `${status.usageCount} usage entries`}
            {status.connectedReporterCount > 0
              ? ` from ${status.connectedReporterCount === 1 ? '1 linked reporter' : `${status.connectedReporterCount} linked reporters`}`
              : ''}.{' '}
          </span>
          <Link className="font-semibold text-primary underline underline-offset-4" href="/report">
            Add a manual report
          </Link>
        </Step>
        <Step number="04" title="Publish and share" complete={status.state === 'public'}>
          <span className="block">
            {outputTotal > 0 ? 'Your GitHub output is ready to showcase. ' : ''}
            Publishing is explicit and reversible.
          </span>
          {status.publicOptIn ? (
            <form action={onUnpublish} className="mt-3">
              <button className="min-h-11 border border-border px-4 text-sm font-semibold hover:border-primary hover:text-primary">
                Unpublish profile
              </button>
            </form>
          ) : (
            <form action={onPublish} className="mt-3">
              <button
                disabled={!status.canPublish}
                className="min-h-11 bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                Publish profile
              </button>
            </form>
          )}
        </Step>
      </ol>
    </div>
  )
}

function Step({
  number,
  title,
  complete,
  children,
}: {
  number: string
  title: string
  complete: boolean
  children: React.ReactNode
}) {
  return (
    <li className="grid gap-3 border-t border-border py-5 sm:grid-cols-[4rem_1fr_auto]">
      <span className="font-mono text-xs text-muted-foreground">{number}</span>
      <div>
        <h3 className="font-semibold">{title}</h3>
        <div className="mt-1 text-sm leading-6 text-muted-foreground">{children}</div>
      </div>
      <span className={`font-mono text-[10px] uppercase tracking-widest ${complete ? 'text-live' : 'text-muted-foreground'}`}>
        {complete ? 'Complete' : 'Next'}
      </span>
    </li>
  )
}
