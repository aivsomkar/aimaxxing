import * as React from 'react'
import { xProfileUrl } from '@/lib/social'

export function XHandleLink({
  handle,
  className = '',
}: {
  handle: string
  className?: string
}) {
  return (
    <a
      href={xProfileUrl(handle)}
      target="_blank"
      rel="noreferrer noopener"
      className={`inline-flex items-center gap-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${className}`}
      aria-label={`${handle} on X`}
    >
      <span aria-hidden="true">𝕏</span>
      {handle}
    </a>
  )
}
