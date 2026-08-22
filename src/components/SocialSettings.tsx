import * as React from 'react'

type FormAction = (formData: FormData) => void | Promise<void>

export function SocialSettings({
  xHandle,
  onSave,
}: {
  xHandle: string | null
  onSave?: FormAction
}) {
  return (
    <section className="border-y border-border py-6" aria-labelledby="social-heading">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">PUBLIC IDENTITY</p>
      <h2 id="social-heading" className="mt-1 font-semibold">Twitter / X</h2>
      <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
        Your handle is shown automatically on your public profile, leaderboard entries, and share card after you save it. Clear the field to remove it everywhere.
      </p>
      <form action={onSave} className="mt-4 flex max-w-lg flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor="xHandle">Twitter or X username</label>
        <input
          id="xHandle"
          name="xHandle"
          defaultValue={xHandle ?? ''}
          placeholder="@username"
          autoComplete="off"
          maxLength={40}
          className="min-w-0 flex-1 border border-input bg-background px-3 py-2.5 font-mono text-sm outline-none focus:border-primary"
        />
        <button className="bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
          Save X handle
        </button>
      </form>
    </section>
  )
}
