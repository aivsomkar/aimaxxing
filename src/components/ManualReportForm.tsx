'use client'

import * as React from 'react'
import Link from 'next/link'
import type {
  ManualReportField,
  ManualReportState,
} from '@/lib/manual-report'

type ReportAction = (state: ManualReportState, formData: FormData) => Promise<ManualReportState>

const idleAction: ReportAction = async () => ({
  status: 'error', message: 'Reporting is unavailable.', errors: {},
})

const initialState: ManualReportState = { status: 'idle', message: '', errors: {} }

export function ManualReportForm({
  handle,
  action,
}: {
  handle: string
  action?: ReportAction
}) {
  const [state, formAction, pending] = React.useActionState(action ?? idleAction, initialState)

  return (
    <div>
      <form action={formAction} className="grid gap-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field state={state} name="tool" label="Tool" placeholder="e.g. codex" required />
          <Field state={state} name="model" label="Model" placeholder="e.g. gpt-5" required />
          <Field state={state} name="day" label="Day" type="date" required />
          <Field state={state} name="sessions" label="Sessions" type="number" min="0" step="1" placeholder="0" />
        </div>

        <fieldset className="border border-border p-4">
          <legend className="px-2 text-sm font-semibold">Tokens · optional</legend>
          <p className="mb-4 text-xs leading-5 text-muted-foreground">
            Add totals if your tool shows them. Leave fields blank when unknown.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field state={state} name="tokensIn" label="Input tokens" type="number" min="0" step="1" placeholder="0" />
            <Field state={state} name="tokensOut" label="Output tokens" type="number" min="0" step="1" placeholder="0" />
            <Field state={state} name="cacheRead" label="Cache read tokens" type="number" min="0" step="1" placeholder="0" />
            <Field state={state} name="cacheWrite" label="Cache write tokens" type="number" min="0" step="1" placeholder="0" />
          </div>
        </fieldset>

        <Field state={state} name="costUsd" label="Cost in USD" type="number" min="0" step="0.01" placeholder="0.00" />

        <div aria-live="polite" role="status" className="min-h-6 text-sm">
          {state.message && (
            <p className={state.status === 'error' ? 'text-destructive' : 'text-live'}>{state.message}</p>
          )}
          {state.status === 'success' && (
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
              <Link className="font-semibold text-primary underline underline-offset-4" href={`/@${handle}`}>View private preview</Link>
              <Link className="font-semibold text-primary underline underline-offset-4" href="/settings">Return to dashboard</Link>
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <button disabled={pending} className="min-h-11 bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-50">
            {pending ? 'Saving…' : 'Save self-reported usage'}
          </button>
          <Link className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline underline-offset-4" href="/settings">
            Back to dashboard
          </Link>
        </div>
      </form>
    </div>
  )
}

function Field({
  state,
  name,
  label,
  ...input
}: {
  state: ManualReportState
  name: ManualReportField
  label: string
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const error = state.errors[name]
  const errorId = `${name}-error`
  return (
    <label className="grid gap-1.5 text-sm" htmlFor={name}>
      <span className="font-medium">{label}</span>
      <input
        {...input}
        id={name}
        name={name}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className="min-h-11 min-w-0 border border-input bg-background px-3 focus-visible:border-primary aria-[invalid=true]:border-destructive"
      />
      {error && <span id={errorId} className="text-xs text-destructive">{error}</span>}
    </label>
  )
}
