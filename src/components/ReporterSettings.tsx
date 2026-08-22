'use client'

import * as React from 'react'
import type { ReporterSummary } from '@/lib/account-status'

type FormAction = (formData: FormData) => void | Promise<void>

export function ReporterSettings({
  reporters,
  onRevoke,
  onDeleteData,
}: {
  reporters: ReporterSummary[]
  onRevoke?: FormAction
  onDeleteData?: FormAction
}) {
  const [copied, setCopied] = React.useState(false)
  const command = 'npx aimaxxing@latest import'

  async function copyCommand() {
    await navigator.clipboard.writeText(command)
    setCopied(true)
  }

  return (
    <section className="space-y-4 border-t border-border pt-8" aria-labelledby="reporter-settings-heading">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">Verified usage</p>
        <h2 id="reporter-settings-heading" className="mt-1 text-lg font-semibold">Connected reporters</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          The local reporter sends only signed daily totals after showing you exactly what will be shared.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <code className="min-w-0 flex-1 overflow-x-auto border border-border bg-background px-3 py-3 text-sm">
          {command}
        </code>
        <button type="button" onClick={copyCommand} className="min-h-11 border border-border px-4 text-sm font-semibold">
          {copied ? 'Copied' : 'Copy command'}
        </button>
      </div>

      {reporters.length === 0 ? (
        <div className="border border-border bg-card p-4">
          <p className="text-sm">Run the command above on the computer with your AI-tool usage.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {reporters.map((reporter) => (
            <li key={reporter.id} className="border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{reporter.machineLabel}</h3>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{reporter.fingerprintPrefix}</p>
                </div>
                <span className={`font-mono text-[10px] uppercase tracking-widest ${reporter.revokedAt ? 'text-muted-foreground' : 'text-live'}`}>
                  {reporter.revokedAt ? 'Revoked' : 'Connected'}
                </span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Linked {reporter.linkedAt.toLocaleDateString('en-US', { timeZone: 'UTC' })}.{' '}
                {reporter.lastSeenAt
                  ? `Last synced ${reporter.lastSeenAt.toLocaleString('en-US', { timeZone: 'UTC' })}.`
                  : 'No sync received yet.'}{' '}
                {reporter.usageCount} verified row{reporter.usageCount === 1 ? '' : 's'}.
              </p>
              <div className="mt-4 flex flex-col gap-3">
                {!reporter.revokedAt && (
                  <form action={onRevoke}>
                    <input type="hidden" name="reporterId" value={reporter.id} />
                    <button className="min-h-11 border border-border px-4 text-sm font-semibold hover:border-destructive hover:text-destructive">
                      Revoke reporter
                    </button>
                  </form>
                )}
                <form action={onDeleteData} className="flex flex-col gap-2 sm:flex-row">
                  <input type="hidden" name="reporterId" value={reporter.id} />
                  <label className="sr-only" htmlFor={`reporter-confirm-${reporter.id}`}>
                    Type the fingerprint confirmation to delete synced data
                  </label>
                  <input
                    id={`reporter-confirm-${reporter.id}`}
                    name="fingerprintConfirmation"
                    required
                    autoComplete="off"
                    placeholder={reporter.fingerprintPrefix}
                    className="min-h-11 min-w-0 flex-1 border border-input bg-background px-3 font-mono text-sm"
                  />
                  <button className="min-h-11 border border-destructive px-4 text-sm font-semibold text-destructive">
                    Delete synced data
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
