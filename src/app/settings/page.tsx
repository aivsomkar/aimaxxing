import { setPublicOptIn, deleteAllData } from './actions'

export default function Settings() {
  return (
    <main className="mx-auto max-w-2xl p-8 space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="space-y-2">
        <h2 className="font-semibold">Public board</h2>
        <p className="text-sm opacity-70">
          Your data is private until you turn this on. Signing in does not list you.
        </p>
        <form action={async () => { 'use server'; await setPublicOptIn(true) }}>
          <button className="rounded-[--radius] bg-primary px-4 py-2 text-primary-foreground">List me publicly</button>
        </form>
        <form action={async () => { 'use server'; await setPublicOptIn(false) }}>
          <button className="rounded border px-4 py-2">Remove me from public boards</button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Delete everything</h2>
        <p className="text-sm opacity-70">Removes all reported usage and unlists you. Irreversible.</p>
        <form action={async () => { 'use server'; await deleteAllData() }}>
          <button className="rounded border border-red-600 px-4 py-2 text-red-600">Delete my data</button>
        </form>
      </section>
    </main>
  )
}
