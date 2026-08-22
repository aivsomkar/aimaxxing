import * as React from 'react'
import type { PortfolioCandidate } from '@/lib/portfolio'

type ManagedProject = {
  id: number
  source: string
  title: string
  description: string | null
  liveUrl: string
  repositoryUrl: string | null
}

type ImportSession = {
  id: string
  source: string
  candidates: PortfolioCandidate[]
}

type FormAction = (formData: FormData) => void | Promise<void>

type ManagerActions = {
  addManual: FormAction
  editProject: FormAction
  removeProject: FormAction
  reorderProjects: FormAction
  startGitHubImport: FormAction
  publishImportSelection: FormAction
}

export function PortfolioManager({
  projects,
  importSession,
  actions,
  message,
  vercelConfigured = true,
}: {
  projects: ManagedProject[]
  importSession: ImportSession | null
  actions?: ManagerActions
  message?: string | null
  vercelConfigured?: boolean
}) {
  return (
    <div className="space-y-10">
      {message && (
        <p className="border border-primary/40 bg-primary/10 px-4 py-3 text-sm" role="status">
          {message}
        </p>
      )}

      <section aria-labelledby="portfolio-import-heading">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">01 · FIND</p>
        <h2 id="portfolio-import-heading" className="mt-1 text-xl font-semibold">Bring in live work</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          We only look for public website links. Nothing appears on your profile until you select it.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <form action={actions?.startGitHubImport}>
            <button className="border border-foreground bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-80">
              Import from GitHub
            </button>
          </form>
          {vercelConfigured ? (
            <a
              href="/api/integrations/vercel/start"
              className="border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:border-primary hover:text-primary"
            >
              Connect Vercel
            </a>
          ) : (
            <span className="cursor-not-allowed border border-border px-4 py-2.5 text-sm text-muted-foreground" title="The Vercel integration has not been configured by the site owner">
              Connect Vercel · unavailable
            </span>
          )}
        </div>
      </section>

      {importSession && (
        <section className="border border-border p-5" aria-labelledby="portfolio-selection-heading">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-live">
            {importSession.source} snapshot ready
          </p>
          <h2 id="portfolio-selection-heading" className="mt-1 text-lg font-semibold">
            Select what belongs on your profile
          </h2>
          {importSession.candidates.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No public live websites were found. Add one manually below.
            </p>
          ) : (
            <form action={actions?.publishImportSelection} className="mt-5">
              <input type="hidden" name="sessionId" value={importSession.id} />
              <div className="divide-y divide-border border-y border-border">
                {importSession.candidates.map((candidate) => (
                  <label key={candidate.externalId} className="flex cursor-pointer items-start gap-3 py-4">
                    <input
                      type="checkbox"
                      name="candidateId"
                      value={candidate.externalId}
                      className="mt-1 accent-[var(--primary)]"
                    />
                    <span className="min-w-0">
                      <span className="block font-medium">{candidate.title}</span>
                      <span className="block truncate font-mono text-[11px] text-muted-foreground">
                        {candidate.liveUrl}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <button className="mt-4 bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
                Add selected
              </button>
            </form>
          )}
        </section>
      )}

      <section aria-labelledby="portfolio-published-heading">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">02 · CURATE</p>
            <h2 id="portfolio-published-heading" className="mt-1 text-xl font-semibold">
              Your showcase · {projects.length}
            </h2>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Top to bottom
          </span>
        </div>

        {projects.length === 0 ? (
          <p className="mt-5 border-y border-border py-6 text-sm text-muted-foreground">
            Your profile has no websites yet. Import above or add the first one manually.
          </p>
        ) : (
          <div className="mt-5 divide-y divide-border border-y border-border">
            {projects.map((project, index) => (
              <details key={project.id} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                  <span className="min-w-0">
                    <span className="mr-3 font-mono text-[10px] text-muted-foreground">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="font-medium">{project.title}</span>
                    <span className="ml-3 font-mono text-[10px] uppercase text-muted-foreground">
                      {project.source}
                    </span>
                  </span>
                  <span className="text-primary group-open:rotate-45" aria-hidden="true">＋</span>
                </summary>
                <div className="mt-5 grid gap-5 pl-8 sm:grid-cols-[1fr_auto]">
                  <form action={actions?.editProject} className="grid gap-3 sm:grid-cols-2">
                    <input type="hidden" name="projectId" value={project.id} />
                    <Field label="Title" name="title" defaultValue={project.title} required />
                    <Field label="Live URL" name="liveUrl" defaultValue={project.liveUrl} required />
                    <Field label="Description" name="description" defaultValue={project.description ?? ''} />
                    <Field label="Repository URL" name="repositoryUrl" defaultValue={project.repositoryUrl ?? ''} />
                    <button className="justify-self-start border border-border px-3 py-2 text-xs font-semibold hover:border-primary hover:text-primary">
                      Save changes
                    </button>
                  </form>
                  <div className="flex items-start gap-2">
                    <form action={actions?.reorderProjects}>
                      <input type="hidden" name="projectId" value={project.id} />
                      <input type="hidden" name="direction" value="up" />
                      <button disabled={index === 0} aria-label={`Move ${project.title} up`} className="border border-border px-2 py-1 disabled:opacity-25">↑</button>
                    </form>
                    <form action={actions?.reorderProjects}>
                      <input type="hidden" name="projectId" value={project.id} />
                      <input type="hidden" name="direction" value="down" />
                      <button disabled={index === projects.length - 1} aria-label={`Move ${project.title} down`} className="border border-border px-2 py-1 disabled:opacity-25">↓</button>
                    </form>
                    <form action={actions?.removeProject}>
                      <input type="hidden" name="projectId" value={project.id} />
                      <button aria-label={`Remove ${project.title}`} className="border border-destructive px-2 py-1 text-destructive">×</button>
                    </form>
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
      </section>

      <details className="border border-border p-5">
        <summary className="cursor-pointer list-none text-base font-semibold text-primary">
          ＋ Add another website
        </summary>
        <form action={actions?.addManual} className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Title" name="title" placeholder="Project name" required />
          <Field label="Live URL" name="liveUrl" placeholder="https://your-project.com" required />
          <Field label="Description · optional" name="description" placeholder="What did you build?" />
          <Field label="Repository URL · optional" name="repositoryUrl" placeholder="https://github.com/you/repo" />
          <button className="justify-self-start bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
            Add to profile
          </button>
        </form>
      </details>
    </div>
  )
}

function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="grid gap-1.5 text-xs font-medium">
      {label}
      <input
        {...props}
        className="min-w-0 border border-input bg-background px-3 py-2.5 text-sm font-normal outline-none focus:border-primary"
      />
    </label>
  )
}
