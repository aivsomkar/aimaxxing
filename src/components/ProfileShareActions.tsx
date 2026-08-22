'use client'

import * as React from 'react'
import { buildXShareUrl, canonicalProfileUrl } from '@/lib/share-intent'

const controlClass = 'inline-flex min-h-11 items-center justify-center border border-border px-4 text-sm font-semibold hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40'

export function ProfileShareActions({
  handle,
  index,
  isPublic,
  downloadUrl,
}: {
  handle: string
  index: string
  isPublic: boolean
  downloadUrl: string
}) {
  const [status, setStatus] = React.useState(
    isPublic ? '' : 'Publish your profile to enable sharing.',
  )
  const profileUrl = canonicalProfileUrl(handle)

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(profileUrl)
      setStatus('Profile link copied.')
    } catch {
      setStatus(`Copy failed. Use this link: ${profileUrl}`)
    }
  }

  async function shareProfile() {
    if (!navigator.share) {
      await copyLink()
      return
    }
    try {
      await navigator.share({
        title: `@${handle} · AI Maxxing`,
        text: `My AI Maxxing Index is ${index}.`,
        url: profileUrl,
      })
      setStatus('Profile shared.')
    } catch (error) {
      if ((error as { name?: string }).name !== 'AbortError') setStatus('Sharing failed. Try copying the link.')
    }
  }

  return (
    <section className="mt-8" aria-labelledby="share-profile-heading">
      <h2 id="share-profile-heading" className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">Share your build record</h2>
      <div className="mt-3 flex flex-wrap gap-3">
        {isPublic ? (
          <a
            className={controlClass}
            href={buildXShareUrl(handle, index)}
            target="_blank"
            rel="noreferrer noopener"
          >
            Share on X
          </a>
        ) : (
          <button className={controlClass} disabled>Share on X</button>
        )}
        <button className={controlClass} disabled={!isPublic} onClick={copyLink}>Copy profile link</button>
        <button className={controlClass} disabled={!isPublic} onClick={shareProfile}>Share profile</button>
        <a className={`${controlClass} bg-primary text-primary-foreground hover:text-primary-foreground`} href={downloadUrl} download>
          Download card
        </a>
      </div>
      <p className="mt-3 min-h-5 text-xs text-muted-foreground" aria-live="polite">{status}</p>
      {isPublic && (
        <a className="mt-1 inline-block break-all text-xs text-muted-foreground underline underline-offset-4" href={profileUrl}>
          {profileUrl}
        </a>
      )}
    </section>
  )
}
