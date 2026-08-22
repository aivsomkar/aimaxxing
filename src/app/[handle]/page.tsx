import { notFound } from 'next/navigation'
import { getProfile } from '@/lib/queries'
import {
  computeIndex,
  CONTRIBUTIONS_PER_UNIT,
  OUTPUT_CAP,
  QUALIFY_SESSIONS,
  QUALIFY_COST_USD,
} from '@/lib/index-math'
import { canAppearOnBoards } from '@/lib/consent'
import { formatUsd } from '@/lib/format'

// NOTE for future editors: this directory MUST be named `[handle]`, not
// `@[handle]`. A leading `@` in a Next.js route segment name declares a
// parallel route slot — a different feature — and would silently stop
// matching `/@handle` links, which strip the `@` in code below instead.
export const dynamic = 'force-dynamic'

function fmt1(v: number): string {
  return v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

export default async function Profile({ params }: { params: Promise<{ handle: string }> }) {
  // Next.js percent-encodes a dynamic segment that begins with '@' (e.g. the
  // literal request path /@omkar arrives as params.handle === '%40omkar'),
  // to keep it unambiguous with the '@folder' parallel-route convention at
  // the filesystem level. decodeURIComponent before stripping the '@' so
  // both that encoded form and a plain '@omkar' work.
  const raw = decodeURIComponent((await params).handle)
  const handle = raw.startsWith('@') ? raw.slice(1) : raw
  const p = await getProfile(handle)
  // getProfile already gates internally, but the consent rule must live in one
  // place (canAppearOnBoards) rather than a bare publicOptIn check re-derived
  // here — see task-10 report. An opted-in user with no data 404s too.
  if (!p || !canAppearOnBoards({ publicOptIn: p.user.publicOptIn, hasData: p.tools.length > 0 })) {
    notFound()
  }

  const b = computeIndex(p.tools, { mergedPrs: p.mergedPrs, contributions: p.contributions })
  const units = Math.max(0, p.mergedPrs) + Math.max(0, p.contributions) / CONTRIBUTIONS_PER_UNIT
  const rawOutput = 2 * Math.sqrt(units)
  const outputCapped = rawOutput > OUTPUT_CAP

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {p.user.avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- external GitHub avatar URL
            <img
              src={p.user.avatarUrl}
              alt=""
              className="h-12 w-12 rounded-full border border-border"
            />
          )}
          <div>
            <h1 className="text-2xl font-bold">@{p.user.handle}</h1>
            <span
              className="text-xs text-muted-foreground"
              title={p.anyUnverified ? 'Includes self-reported usage' : 'All usage verified'}
            >
              {p.anyUnverified ? '🔶 self-reported' : '✅ verified'}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-3xl tabular-nums text-primary">{fmt1(b.index)}</div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Index</div>
        </div>
      </header>

      {/* Every number here is reproducible from the JSON at the link below:
          per-tool score, whether it qualified, the stack-depth sum, the
          output term's inputs and cap, and the final total. See DESIGN.md
          and the task-10 brief — this table is the credibility claim. */}
      <table className="mt-8 w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="pb-2 font-normal">Tool</th>
            <th className="pb-2 text-right font-normal">Sessions</th>
            <th className="pb-2 text-right font-normal">√ score</th>
          </tr>
        </thead>
        <tbody>
          {b.perTool.map((t) => (
            <tr
              key={t.tool}
              className={`border-t border-border ${t.qualified ? '' : 'opacity-40'}`}
            >
              <td className="py-2">{t.tool}</td>
              <td className="py-2 text-right font-mono tabular-nums">
                {t.sessions.toLocaleString()}
              </td>
              <td className="py-2 text-right font-mono tabular-nums">
                {t.qualified
                  ? `√${t.sessions} → ${fmt1(t.score)}`
                  : `below floor (< ${QUALIFY_SESSIONS} sessions & < $${QUALIFY_COST_USD})`}
              </td>
            </tr>
          ))}
          {b.perTool.length === 0 && (
            <tr className="border-t border-border">
              <td className="py-2 text-muted-foreground" colSpan={3}>
                No tools reported.
              </td>
            </tr>
          )}
          <tr className="border-t border-border font-medium">
            <td className="py-2" colSpan={2}>
              sum of qualifying scores → stack depth
            </td>
            <td className="py-2 text-right font-mono tabular-nums">{fmt1(b.stackDepth)}</td>
          </tr>
          <tr className="border-t border-border">
            <td className="py-2 text-muted-foreground" colSpan={2}>
              output · {p.mergedPrs.toLocaleString()} merged PRs + {p.contributions.toLocaleString()}{' '}
              contributions ÷ {CONTRIBUTIONS_PER_UNIT}
              {outputCapped ? ` (capped at ${OUTPUT_CAP})` : ''}
            </td>
            <td className="py-2 text-right font-mono tabular-nums">
              2·√{units.toFixed(2)} → + {fmt1(b.outputTerm)}
            </td>
          </tr>
          <tr className="border-t-2 border-foreground font-semibold">
            <td className="py-2" colSpan={2}>
              stack depth + output = Index
            </td>
            <td className="py-2 text-right font-mono tabular-nums text-primary">
              {fmt1(b.index)}
            </td>
          </tr>
        </tbody>
      </table>

      <p className="mt-8 text-xs text-muted-foreground">
        Total spend ${formatUsd(p.costUsd)} — not included in the Index.{' '}
        <a className="underline" href={`/api/v1/profile/${p.user.handle}`}>
          Raw JSON
        </a>{' '}
        ·{' '}
        <a className="underline" href="/methodology">
          How this is calculated
        </a>
      </p>
    </main>
  )
}
