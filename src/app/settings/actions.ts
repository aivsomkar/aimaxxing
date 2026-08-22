'use server'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { db } from '@/db/client'
import { users } from '@/db/schema'
import { setPublicOptInForUser, deleteAllDataForUser } from '@/lib/account'

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
