export function LiveStatBar({
  developers,
  tokensTotal,
  costUsd,
}: {
  developers: number
  tokensTotal: number
  costUsd: number
}) {
  return (
    <div className="border-b border-border bg-muted/40">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-3 gap-y-1 px-6 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-live" />
          <span className="font-mono tabular-nums text-foreground">
            {developers.toLocaleString()}
          </span>{' '}
          developers
        </span>
        <span aria-hidden>·</span>
        <span>
          <span className="font-mono tabular-nums text-foreground">
            {tokensTotal.toLocaleString()}
          </span>{' '}
          tokens
        </span>
        <span aria-hidden>·</span>
        <span>
          <span className="font-mono tabular-nums text-foreground">
            ${costUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>{' '}
          est. API value
        </span>
      </div>
    </div>
  )
}
