'use server'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db/client'
import { reporters, users } from '@/db/schema'
import { setPublicOptInForUser, deleteAllDataForUser, setXHandleForUser } from '@/lib/account'
import { getAccountStatus } from '@/lib/account-status'
import { validateXHandle } from '@/lib/social'
import { deleteReporterData } from '@/lib/reporter-store'
import { revokeOwnedReporter } from '@/lib/reporter-revoke'
import { z } from 'zod'

// Not unit-tested directly: it calls next-auth's auth(), which needs the
// request-scoped machinery Next wires up at request time. The mutations it
// wraps (setPublicOptInForUser, deleteAllDataForUser) are the tested logic;
// this function is just an auth check plus a lookup.
async function currentUser() {
  const session = await auth()
  const handle = (session?.user as any)?.handle
  if (!handle) throw new Error('unauthenticated')
  const [u] = await db.select().from(users).where(eq(users.handle, handle))
  if (!u) throw new Error('no such user')
  return u
}

function revalidatePublicSurfaces(handle: string) {
  revalidatePath('/')
  revalidatePath(`/@${handle}`)
  revalidatePath(`/${handle}`)
  revalidatePath(`/api/v1/profile/${handle}`)
  revalidatePath(`/api/v1/profile/${handle}/card`)
  revalidatePath('/settings')
}

export async function setPublicOptIn(value: boolean) {
  const u = await currentUser()
  if (value) {
    const status = await getAccountStatus(db, u.id)
    if (!status?.canPublish) {
      redirect('/settings?error=Add%20a%20live%20website%2C%20AI%20usage%2C%20or%20GitHub%20output%20before%20publishing')
    }
  }
  await setPublicOptInForUser(db, u.id, value)
  revalidatePublicSurfaces(u.handle)
  redirect(`/settings?notice=${value ? 'Profile%20published' : 'Profile%20unpublished'}`)
}

export async function deleteAllData(formData: FormData) {
  const u = await currentUser()
  const confirmation = String(formData.get('confirmation') ?? '').trim()
  if (confirmation !== u.handle) {
    redirect(`/settings?error=${encodeURIComponent(`Type ${u.handle} exactly to delete your data`)}`)
  }
  await deleteAllDataForUser(db, u.id)
  revalidatePublicSurfaces(u.handle)
  redirect('/settings?notice=Account%20data%20deleted')
}

export async function saveXHandle(formData: FormData) {
  const u = await currentUser()
  const input = String(formData.get('xHandle') ?? '')
  const result = validateXHandle(input)
  if (!result.ok) redirect(`/settings?error=${encodeURIComponent(result.error)}`)

  await setXHandleForUser(db, u.id, input)
  revalidatePublicSurfaces(u.handle)
  redirect(`/settings?notice=${result.value ? 'X%20handle%20published' : 'X%20handle%20removed'}`)
}

export async function revokeUsageReporter(formData: FormData) {
  const u = await currentUser()
  const reporterId = z.string().uuid().safeParse(String(formData.get('reporterId') ?? ''))
  if (!reporterId.success || !await revokeOwnedReporter(db, u.id, reporterId.data, false)) {
    redirect('/settings?error=Reporter%20could%20not%20be%20revoked')
  }
  revalidatePublicSurfaces(u.handle)
  redirect('/settings?notice=Reporter%20revoked')
}

export async function deleteUsageReporterData(formData: FormData) {
  const u = await currentUser()
  const reporterId = z.string().uuid().safeParse(String(formData.get('reporterId') ?? ''))
  if (!reporterId.success) redirect('/settings?error=Reporter%20could%20not%20be%20found')
  const [reporter] = await db.select({
    fingerprint: reporters.publicKeyFingerprint,
  }).from(reporters).where(and(
    eq(reporters.id, reporterId.data),
    eq(reporters.userId, u.id),
  ))
  const expected = reporter?.fingerprint.slice(0, 23)
  const confirmation = String(formData.get('fingerprintConfirmation') ?? '').trim()
  if (!expected || confirmation !== expected
    || !await deleteReporterData(db, u.id, reporterId.data)) {
    redirect('/settings?error=Type%20the%20displayed%20fingerprint%20exactly%20to%20delete%20reporter%20data')
  }
  revalidatePublicSurfaces(u.handle)
  redirect('/settings?notice=Reporter%20usage%20deleted')
}
