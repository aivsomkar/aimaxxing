'use client'

import { signOut, useSession } from 'next-auth/react'
import { HeaderNav } from '@/components/HeaderNav'
import { viewerFromSession } from '@/lib/auth-session'

export function Header() {
  const { data: session, status } = useSession()
  const viewer = viewerFromSession(session)

  async function logout() {
    await signOut({ redirectTo: '/' })
  }

  return (
    <header className="border-b border-border">
      <HeaderNav viewer={viewer} onSignOut={logout} pending={status === 'loading'} />
    </header>
  )
}
