'use client'

import Link from 'next/link'
import * as React from 'react'
import { useSession } from 'next-auth/react'
import { viewerFromSession } from '@/lib/auth-session'

export function PrivateProfileNotice() {
  const { data: session } = useSession()
  const viewer = viewerFromSession(session)
  const handle = viewer?.handle ?? null
  const [isPublic, setIsPublic] = React.useState<boolean | null>(null)

  React.useEffect(() => {
    setIsPublic(null)
    if (!handle) return

    const controller = new AbortController()
    void fetch('/api/v1/me/profile-status', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Profile status failed: ${response.status}`)
        return response.json() as Promise<{ isPublic?: unknown }>
      })
      .then((status) => {
        if (typeof status.isPublic === 'boolean') setIsPublic(status.isPublic)
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setIsPublic(null)
      })

    return () => controller.abort()
  }, [handle])

  return <PrivateProfileNoticeContent isPublic={isPublic} />
}

export function PrivateProfileNoticeContent({ isPublic }: { isPublic: boolean | null }) {
  if (isPublic !== false) return null

  return (
    <div className="mt-6 flex flex-col justify-between gap-3 border border-primary/30 bg-primary/10 px-4 py-3 text-sm sm:flex-row sm:items-center">
      <span>Your profile is private. Finish setup, preview your card, and publish when it is ready.</span>
      <Link className="inline-flex min-h-11 shrink-0 items-center font-semibold text-primary underline underline-offset-4" href="/settings">
        Open dashboard
      </Link>
    </div>
  )
}
