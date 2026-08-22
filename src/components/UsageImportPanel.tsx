'use client'

import * as React from 'react'

const IMPORT_COMMAND = 'npx aimaxxing@latest import'

export function UsageImportPanel() {
  const [copyState, setCopyState] = React.useState<'idle' | 'copied' | 'error'>('idle')

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(IMPORT_COMMAND)
      setCopyState('copied')
    } catch {
      setCopyState('error')
    }
  }

  return (
    <section className="border border-primary/40 bg-card p-5 sm:p-7" aria-labelledby="cli-import-heading">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-live">Recommended · verified import</p>
      <h2 id="cli-import-heading" className="mt-2 text-xl font-semibold">Import directly from your AI tools</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
        Run one command on the machine where you use Codex CLI, Claude Code, or OpenCode.
        It previews exactly what will be shared, opens this site for approval, and imports the first snapshot.
      </p>

      <div className="mt-5 flex flex-col gap-3 border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
        <code className="overflow-x-auto whitespace-nowrap font-mono text-sm text-foreground">{IMPORT_COMMAND}</code>
        <button
          type="button"
          onClick={copyCommand}
          className="min-h-11 shrink-0 border border-border px-4 text-sm font-semibold hover:border-primary hover:text-primary"
        >
          {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy failed' : 'Copy command'}
        </button>
      </div>

      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        Requires Node.js 22+. Prompts, responses, source code, file paths, and repository names stay local;
        only daily aggregates for tools, models, sessions, tokens, and estimated cost are uploaded after approval.
      </p>
    </section>
  )
}
