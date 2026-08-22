import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { submitManualReport } from './actions'

export default async function Report() {
  // No middleware.ts guards this route; anonymous visitors would otherwise hit
  // submitManualReport's 'unauthenticated' throw and see a raw Next.js error page.
  const session = await auth()
  if (!(session?.user as any)?.handle) redirect('/api/auth/signin')

  return (
    <main className="mx-auto max-w-xl p-8 space-y-4">
      <h1 className="text-2xl font-bold">Add usage manually</h1>
      <p className="text-sm opacity-70">
        Manual entries carry a self-reported badge, sort below verified entries, and are excluded
        from the model breakdown on the homepage.
      </p>
      <form action={submitManualReport} className="grid gap-3">
        <label className="grid gap-1 text-sm">
          Tool
          <input name="tool" placeholder="e.g. cursor" required className="border p-2 rounded" />
        </label>
        <label className="grid gap-1 text-sm">
          Model
          <input name="model" placeholder="e.g. sonnet" required className="border p-2 rounded" />
        </label>
        <label className="grid gap-1 text-sm">
          Day
          <input name="day" type="date" required className="border p-2 rounded" />
        </label>
        <label className="grid gap-1 text-sm">
          Sessions
          <input name="sessions" type="number" min="0" required className="border p-2 rounded" />
        </label>
        <label className="grid gap-1 text-sm">
          Cost in USD
          <input name="costUsd" type="number" min="0" step="0.01" required className="border p-2 rounded" />
        </label>
        <button className="rounded-[--radius] bg-primary px-4 py-2 text-primary-foreground">Submit</button>
      </form>
    </main>
  )
}
