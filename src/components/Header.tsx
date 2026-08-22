import { auth, signOut } from '@/auth'
import { HeaderNav } from '@/components/HeaderNav'

export async function Header() {
  const session = await auth()
  const user = session?.user as { handle?: string; publicOptIn?: boolean } | undefined
  const viewer = user?.handle
    ? { handle: user.handle, publicOptIn: user.publicOptIn === true }
    : null

  async function logout() {
    'use server'
    await signOut({ redirectTo: '/' })
  }

  return (
    <header className="border-b border-border">
      <HeaderNav viewer={viewer} onSignOut={logout} />
    </header>
  )
}
