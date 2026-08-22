'use server'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db/client'
import { users } from '@/db/schema'
import { setPublicOptInForUser, deleteAllDataForUser, setXHandleForUser } from '@/lib/account'
import { validateXHandle } from '@/lib/social'

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

export async function setPublicOptIn(value: boolean) {
  const u = await currentUser()
  await setPublicOptInForUser(db, u.id, value)
  revalidatePath('/')
  revalidatePath(`/@${u.handle}`)
}

export async function deleteAllData() {
  const u = await currentUser()
  await deleteAllDataForUser(db, u.id)
  revalidatePath('/')
}

export async function saveXHandle(formData: FormData) {
  const u = await currentUser()
  const input = String(formData.get('xHandle') ?? '')
  const result = validateXHandle(input)
  if (!result.ok) redirect(`/settings?error=${encodeURIComponent(result.error)}`)

  await setXHandleForUser(db, u.id, input)
  revalidatePath('/')
  revalidatePath(`/@${u.handle}`)
  revalidatePath(`/${u.handle}`)
  redirect(`/settings?notice=${result.value ? 'X%20handle%20published' : 'X%20handle%20removed'}`)
}
