import * as React from 'react'
import type { PublicPortfolioProject } from '@/lib/queries'

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function sourceLabel(source: string): string {
  if (source === 'github') return 'GITHUB'
  if (source === 'vercel') return 'VERCEL'
  return 'MANUAL'
}

export function PortfolioGrid({ projects }: { projects: PublicPortfolioProject[] }) {
  if (projects.length === 0) return null

  return (
    <section className="mt-14 border-t border-border pt-7" aria-labelledby="portfolio-heading">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">
            BUILT · {projects.length} LIVE {projects.length === 1 ? 'PROJECT' : 'PROJECTS'}
          </p>
          <h2 id="portfolio-heading" className="mt-1 text-xl font-semibold tracking-tight">
            Things on the internet
          </h2>
        </div>
        <span className="hidden font-mono text-[10px] uppercase tracking-widest text-muted-foreground sm:block">
          Selected by maker
        </span>
      </div>

      <div className="grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2">
        {projects.map((project, index) => (
          <a
            key={project.id}
            href={project.liveUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="group relative min-h-44 bg-background p-5 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
          >
            <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <span>{String(index + 1).padStart(2, '0')} / {sourceLabel(project.source)}</span>
              <span aria-hidden="true" className="text-base leading-none text-primary transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5">↗</span>
            </div>
            <h3 className="mt-7 text-lg font-semibold leading-tight tracking-tight group-hover:text-primary">
              {project.title}
            </h3>
            {project.description && (
              <p className="mt-2 line-clamp-2 text-sm leading-5 text-muted-foreground">
                {project.description}
              </p>
            )}
            <p className="mt-5 font-mono text-[11px] text-muted-foreground">
              <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-live" aria-hidden="true" />
              {hostname(project.liveUrl)}
            </p>
          </a>
        ))}
      </div>
    </section>
  )
}
