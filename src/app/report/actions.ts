'use server'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { db } from '@/db/client'
import { users } from '@/db/schema'
import { writeReport } from '@/lib/ingest'
import {
  type ManualReportState,
  validateManualReportForm,
} from '@/lib/manual-report'

// Not unit-tested directly: it calls next-auth's auth(), which needs the
// request-scoped machinery Next wires up at request time. The form parsing
// (parseManualReportForm) and the write (writeReport, already covered by
// tests/ingest-db.test.ts) are the tested logic; this function is just an
// auth check, a lookup, and gluing the two together.
export async function submitManualReport(
  _previousState: ManualReportState,
  formData: FormData,
): Promise<ManualReportState> {
  const validation = validateManualReportForm(formData)
  if (!validation.success) {
    return {
      status: 'error',
      message: 'Check the highlighted fields and try again.',
      errors: validation.errors,
    }
  }
  const session = await auth()
  const handle = (session?.user as any)?.handle
  if (!handle) return { status: 'error', message: 'Sign in again to submit usage.', errors: {} }
  const [u] = await db.select().from(users).where(eq(users.handle, handle))
  if (!u) return { status: 'error', message: 'Your account could not be found.', errors: {} }

  try {
    await writeReport(db, u.id, validation.rows)
    revalidatePath('/')
    revalidatePath('/settings')
    revalidatePath(`/@${u.handle}`)
    revalidatePath(`/${u.handle}`)
    return {
      status: 'success',
      message: 'Usage saved. Your private preview and account totals are updated.',
      errors: {},
    }
  } catch {
    console.error('manual_report_write_failed', { userId: u.id })
    return { status: 'error', message: 'Usage could not be saved. Please try again.', errors: {} }
  }
}
