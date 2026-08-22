'use server'

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { db } from '@/db/client'
import { users } from '@/db/schema'
import { approveReporterLink, denyReporterLink } from '@/lib/reporter-link'

export async function decideReporterLink(formData: FormData) {
  const code = String(formData.get('userCode') ?? '').trim().toUpperCase()
  const decision = String(formData.get('decision') ?? '')
  const session = await auth()
  const handle = (session?.user as { handle?: string } | undefined)?.handle
  if (!handle) redirect(`/signin?callbackUrl=${encodeURIComponent(`/link?code=${code}`)}`)
  const [user] = await db.select().from(users).where(eq(users.handle, handle))
  if (!user) redirect('/signin')

  const accepted = decision === 'approve'
    ? await approveReporterLink(db, code, user.id)
    : decision === 'deny'
      ? await denyReporterLink(db, code, user.id)
      : false
  if (!accepted) redirect(`/link?code=${encodeURIComponent(code)}&error=This%20link%20is%20invalid%20or%20expired`)
  revalidatePath('/settings')
  redirect(`/link?code=${encodeURIComponent(code)}&notice=${decision === 'approve' ? 'Device%20approved' : 'Device%20denied'}`)
}
