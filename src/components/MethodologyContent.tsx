import * as React from 'react'
import {
  CONTRIBUTIONS_PER_UNIT,
  OUTPUT_CAP,
  QUALIFY_COST_USD,
  QUALIFY_SESSIONS,
} from '@/lib/index-math'

export function MethodologyContent() {
  return (
    <article className="space-y-12 text-sm leading-7 text-muted-foreground">
      <section aria-labelledby="formula-heading">
        <Eyebrow>01 · THE INDEX</Eyebrow>
        <h2 id="formula-heading" className="mt-1 text-xl font-semibold text-foreground">A reproducible score, not a mystery rank</h2>
        <p className="mt-3 max-w-[70ch]">
          The AI Maxxing Index adds stack depth to a capped GitHub output term.
          Every intermediate number is visible on the profile and in its public JSON.
        </p>
        <div className="mt-5 overflow-x-auto border-y border-border py-5 font-mono text-sm text-foreground">
          Index = Σ √(tool sessions) + min({OUTPUT_CAP}, 2 × √(merged PRs + contributions ÷ {CONTRIBUTIONS_PER_UNIT}))
        </div>
      </section>

      <section aria-labelledby="qualification-heading">
        <Eyebrow>02 · QUALIFICATION</Eyebrow>
        <h2 id="qualification-heading" className="mt-1 text-xl font-semibold text-foreground">Real use earns stack depth</h2>
        <p className="mt-3 max-w-[70ch]">
          A tool contributes to stack depth after at least {QUALIFY_SESSIONS} sessions
          or ${QUALIFY_COST_USD} of reported spend. Qualifying tool depth is the square
          root of its sessions, rewarding breadth without letting repetition grow linearly.
        </p>
        <p className="mt-3 max-w-[70ch]">
          Spend is displayed as part of the build record but never added directly to the
          Index. A larger budget cannot buy a larger score by itself.
        </p>
      </section>

      <section aria-labelledby="output-heading">
        <Eyebrow>03 · OUTPUT</Eyebrow>
        <h2 id="output-heading" className="mt-1 text-xl font-semibold text-foreground">GitHub proves output, not AI usage</h2>
        <p className="mt-3 max-w-[70ch]">
          Merged pull requests and contribution-calendar activity form the output term.
          Every {CONTRIBUTIONS_PER_UNIT} contributions count as one output unit, and the
          entire output bonus is capped at {OUTPUT_CAP} points.
        </p>
        <p className="mt-3 max-w-[70ch]">
          GitHub cannot reveal local Claude Code, Codex, or OpenCode consumption.
          Those tool, model, token, and spend aggregates come from a manual report or
          the privacy-preserving local reporter.
        </p>
      </section>

      <section aria-labelledby="verification-heading">
        <Eyebrow>04 · VERIFICATION</Eyebrow>
        <h2 id="verification-heading" className="mt-1 text-xl font-semibold text-foreground">Verified and Self-reported stay visibly different</h2>
        <p className="mt-3 max-w-[70ch]">
          Self-reported rows are entered by the account owner and remain labeled as such.
          Verified rows are signed by a linked local reporter and accepted only after
          protocol validation. Mixed profiles disclose that both sources are present.
        </p>
      </section>

      <section aria-labelledby="privacy-heading">
        <Eyebrow>05 · PRIVACY</Eyebrow>
        <h2 id="privacy-heading" className="mt-1 text-xl font-semibold text-foreground">Only aggregates leave the machine</h2>
        <p className="mt-3 max-w-[70ch]">
          The reporter sends daily counts for tools, models, sessions, tokens, and cost.
          It never sends prompts, responses, reasoning, code, commands, file paths,
          repository names, attachments, or raw local records.
        </p>
        <p className="mt-3 max-w-[70ch]">
          Connecting data and publishing a profile are separate choices. Signing in,
          importing candidates, or syncing usage never makes an account public.
        </p>
      </section>

      <section aria-labelledby="sponsor-heading">
        <Eyebrow>06 · NEUTRALITY</Eyebrow>
        <h2 id="sponsor-heading" className="mt-1 text-xl font-semibold text-foreground">Sponsors cannot buy position</h2>
        <p className="mt-3 max-w-[70ch]">
          Sponsored credits are excluded from competitive headline totals. Sponsorship
          never changes verification, qualification, rank, or the Index formula.
        </p>
      </section>
    </article>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">{children}</p>
}
