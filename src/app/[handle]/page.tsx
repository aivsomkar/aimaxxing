import { notFound } from 'next/navigation'
import { auth } from '@/auth'
import { getProfileForViewer } from '@/lib/queries'
import {
  computeIndex,
  CONTRIBUTIONS_PER_UNIT,
  OUTPUT_CAP,
  QUALIFY_SESSIONS,
  QUALIFY_COST_USD,
  SESSIONS_CAP_PER_TOOL,
} from '@/lib/index-math'
import { formatUsd, formatCount } from '@/lib/format'
import { PortfolioGrid } from '@/components/PortfolioGrid'
import { XHandleLink } from '@/components/XHandleLink'
import { ProfileShareActions } from '@/components/ProfileShareActions'
import { buildShareCardData, decodeShareHandle } from '@/lib/share-card'

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
  // the filesystem level. decodeShareHandle decodes safely (a malformed
  // escape must 404, not 500) and strips the '@'.
  const handle = decodeShareHandle((await params).handle)
  const session = await auth()
  const viewerHandle = (session?.user as { handle?: string } | undefined)?.handle ?? null
  const result = await getProfileForViewer(handle, viewerHandle)
  if (!result) notFound()
  const { profile: p, isOwner, isPublic } = result

  const b = computeIndex(p.tools, { mergedPrs: p.mergedPrs, contributions: p.contributions })
  const units = Math.max(0, p.mergedPrs) + Math.max(0, p.contributions) / CONTRIBUTIONS_PER_UNIT
  const rawOutput = 2 * Math.sqrt(units)
  const outputCapped = rawOutput > OUTPUT_CAP
  const card = buildShareCardData(p)
  const cardUrl = isPublic
    ? `/api/v1/profile/${encodeURIComponent(p.user.handle)}/card`
    : '/api/v1/me/card'

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      {isOwner && !isPublic && (
        <div className="mb-6 border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm">
          <strong>Private preview.</strong> Only you can see this profile. Add a live project or AI usage,
          then publish it from Settings when you are ready to share.
        </div>
      )}
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
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              {p.tools.length > 0 ? (
                <span
                  className="text-xs text-muted-foreground"
                  title={p.anyUnverified ? 'Includes self-reported usage' : 'All usage verified'}
                >
                  {p.anyUnverified ? '🔶 self-reported' : '✅ verified'}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">AI usage not connected</span>
              )}
              {p.xHandle && <XHandleLink handle={p.xHandle} />}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-3xl tabular-nums text-primary">{fmt1(b.index)}</div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Index</div>
        </div>
      </header>

      <section className="mt-8" aria-labelledby="profile-card-heading">
        <h2 id="profile-card-heading" className="sr-only">AI Maxxing profile card</h2>
        {/* eslint-disable-next-line @next/next/no-img-element -- dynamic authenticated image endpoint */}
        <img
          src={cardUrl}
          alt={`AI Maxxing card for @${p.user.handle}: Index ${card.index}, ${card.toolLabel}, ${card.projectLabel}, ${card.tokens} tokens`}
          className="aspect-[1200/630] w-full border border-border bg-card object-cover"
        />
        <ProfileShareActions
          handle={p.user.handle}
          index={card.index}
          isPublic={isPublic}
          downloadUrl={cardUrl}
        />
      </section>

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
                {formatCount(t.sessions)}
              </td>
                <td className="py-2 text-right font-mono tabular-nums">
                  {t.qualified
                    ? `√${formatCount(Math.min(t.sessions, SESSIONS_CAP_PER_TOOL))} → ${fmt1(t.score)}`
                    : `below floor (< ${QUALIFY_SESSIONS} sessions & < $${QUALIFY_COST_USD})`}
                </td>
            </tr>
          ))}
          {b.perTool.length === 0 && (
            <tr className="border-t border-border">
              <td className="py-2 text-muted-foreground" colSpan={3}>
                No AI usage yet. Add a manual report from your dashboard to show tools, models, and tokens.
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
              output · <span className="font-mono tabular-nums">{formatCount(p.mergedPrs)}</span>{' '}
              merged PRs + <span className="font-mono tabular-nums">{formatCount(p.contributions)}</span>{' '}
              contributions ÷ <span className="font-mono tabular-nums">{CONTRIBUTIONS_PER_UNIT}</span>
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
        {card.spendLabel} <span className="font-mono tabular-nums">{card.spend}</span> — not included in
        the Index.{' '}
        {isPublic && (
          <><a className="underline" href={`/api/v1/profile/${p.user.handle}`}>Raw JSON</a>{' · '}</>
        )}
        <a className="underline" href="/methodology">
          How this is calculated
        </a>
      </p>

      <PortfolioGrid projects={p.projects} />
    </main>
  )
}
