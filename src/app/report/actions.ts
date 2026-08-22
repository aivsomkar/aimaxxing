'use server'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { db } from '@/db/client'
import { users } from '@/db/schema'
import { writeReport } from '@/lib/ingest'
import { parseManualReportForm } from '@/lib/manual-report'

// Not unit-tested directly: it calls next-auth's auth(), which needs the
// request-scoped machinery Next wires up at request time. The form parsing
// (parseManualReportForm) and the write (writeReport, already covered by
// tests/ingest-db.test.ts) are the tested logic; this function is just an
// auth check, a lookup, and gluing the two together.
export async function submitManualReport(formData: FormData) {
  const session = await auth()
  const handle = (session?.user as any)?.handle
  if (!handle) throw new Error('unauthenticated')
  const [u] = await db.select().from(users).where(eq(users.handle, handle))
  if (!u) throw new Error('no such user')

  const rows = parseManualReportForm(formData)
  await writeReport(db, u.id, rows)
  revalidatePath('/')
}
