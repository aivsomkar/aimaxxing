import * as React from 'react'

type FormAction = (formData: FormData) => void | Promise<void>

export function ReporterApproval({
  link,
  action,
}: {
  link: {
    userCode: string
    machineLabel: string
    fingerprintPrefix: string
    expiresAt: Date
  }
  action?: FormAction
}) {
  return (
    <section className="border border-border bg-card p-6 sm:p-8" aria-labelledby="approve-reporter-heading">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">LOCAL REPORTER</p>
      <h1 id="approve-reporter-heading" className="mt-2 text-2xl font-semibold">Approve this device?</h1>
      <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
        This links a local aggregates-only reporter to your account. It does not publish your profile.
      </p>

      <dl className="mt-6 divide-y divide-border border-y border-border text-sm">
        <div className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr]">
          <dt className="text-muted-foreground">Code</dt>
          <dd className="font-mono text-lg tracking-widest">{link.userCode}</dd>
        </div>
        <div className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr]">
          <dt className="text-muted-foreground">Device</dt>
          <dd>{link.machineLabel}</dd>
        </div>
        <div className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr]">
          <dt className="text-muted-foreground">Key fingerprint</dt>
          <dd className="font-mono text-xs">{link.fingerprintPrefix}…</dd>
        </div>
        <div className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr]">
          <dt className="text-muted-foreground">Expires</dt>
          <dd><time dateTime={link.expiresAt.toISOString()}>{link.expiresAt.toLocaleString()}</time></dd>
        </div>
      </dl>

      <form action={action} className="mt-6 flex flex-wrap gap-3">
        <input type="hidden" name="userCode" value={link.userCode} />
        <button name="decision" value="approve" className="min-h-11 bg-primary px-5 font-semibold text-primary-foreground">
          Approve device
        </button>
        <button name="decision" value="deny" className="min-h-11 border border-border px-5 font-semibold text-destructive">
          Deny
        </button>
      </form>
    </section>
  )
}
