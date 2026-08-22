import type { Metadata } from 'next'
import { MethodologyContent } from '@/components/MethodologyContent'

export const metadata: Metadata = {
  title: 'Methodology · AI Maxxing',
  description: 'How AI Maxxing calculates the Index, verifies usage, and protects local data.',
}

export default function MethodologyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <header className="border-b border-border pb-8">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">Open methodology</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">Every number should explain itself.</h1>
        <p className="mt-4 max-w-[65ch] text-base leading-7 text-muted-foreground">
          The arena is competitive. The calculation, verification labels, privacy boundary,
          and publication rules stay transparent.
        </p>
      </header>
      <div className="mt-10">
        <MethodologyContent />
      </div>
    </main>
  )
}
