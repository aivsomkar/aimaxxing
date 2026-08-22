'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db/client'
import { users } from '@/db/schema'
import { fetchGitHubPortfolioCandidates } from '@/lib/github-portfolio'
import {
  PortfolioValidationError,
  addManualProject,
  createImportSession,
  listPortfolioProjects,
  publishSelectedCandidates,
  removePortfolioProject,
  reorderPortfolioProjects,
  updatePortfolioProject,
} from '@/lib/portfolio-store'

async function currentUser() {
  const session = await auth()
  const handle = (session?.user as { handle?: string } | undefined)?.handle
  if (!handle) throw new Error('unauthenticated')
  const [user] = await db.select().from(users).where(eq(users.handle, handle))
  if (!user) throw new Error('no such user')
  return user
}

function inputFrom(formData: FormData) {
  return {
    title: String(formData.get('title') ?? ''),
    liveUrl: String(formData.get('liveUrl') ?? ''),
    description: String(formData.get('description') ?? ''),
    repositoryUrl: String(formData.get('repositoryUrl') ?? ''),
  }
}

function projectIdFrom(formData: FormData): number {
  const id = Number(formData.get('projectId'))
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('invalid project')
  return id
}

function refreshPortfolio(handle: string) {
  revalidatePath('/settings/portfolio')
  revalidatePath(`/@${handle}`)
  revalidatePath(`/${handle}`)
}

function validationMessage(error: unknown): string {
  if (error instanceof PortfolioValidationError) {
    return Object.values(error.errors).find(Boolean) ?? 'Check the website details.'
  }
  return error instanceof Error ? error.message : 'Something went wrong.'
}

export async function addManual(formData: FormData) {
  const user = await currentUser()
  try {
    await addManualProject(db, user.id, inputFrom(formData))
  } catch (error) {
    redirect(`/settings/portfolio?error=${encodeURIComponent(validationMessage(error))}`)
  }
  refreshPortfolio(user.handle)
  redirect('/settings/portfolio?notice=Website%20added')
}

export async function editProject(formData: FormData) {
  const user = await currentUser()
  try {
    await updatePortfolioProject(db, user.id, projectIdFrom(formData), inputFrom(formData))
  } catch (error) {
    redirect(`/settings/portfolio?error=${encodeURIComponent(validationMessage(error))}`)
  }
  refreshPortfolio(user.handle)
  redirect('/settings/portfolio?notice=Website%20updated')
}

export async function removeProject(formData: FormData) {
  const user = await currentUser()
  await removePortfolioProject(db, user.id, projectIdFrom(formData))
  refreshPortfolio(user.handle)
  redirect('/settings/portfolio?notice=Website%20removed')
}

export async function reorderProjects(formData: FormData) {
  const user = await currentUser()
  const projects = await listPortfolioProjects(db, user.id)
  const projectId = projectIdFrom(formData)
  const index = projects.findIndex((project: { id: number }) => project.id === projectId)
  if (index < 0) throw new Error('portfolio project not found')
  const delta = formData.get('direction') === 'up' ? -1 : 1
  const target = index + delta
  if (target >= 0 && target < projects.length) {
    const orderedIds = projects.map((project: { id: number }) => project.id)
    ;[orderedIds[index], orderedIds[target]] = [orderedIds[target], orderedIds[index]]
    await reorderPortfolioProjects(db, user.id, orderedIds)
  }
  refreshPortfolio(user.handle)
}

export async function startGitHubImport() {
  const user = await currentUser()
  if (!user.githubLogin) {
    redirect('/settings/portfolio?error=Reconnect%20GitHub%20to%20import%20repositories')
  }
  try {
    const candidates = await fetchGitHubPortfolioCandidates(user.githubLogin)
    const importSession = await createImportSession(db, user.id, 'github', candidates)
    redirect(`/settings/portfolio?import=${importSession.id}`)
  } catch (error) {
    // Next.js redirects are implemented as throws and must pass through.
    if (error && typeof error === 'object' && 'digest' in error) throw error
    redirect(`/settings/portfolio?error=${encodeURIComponent(validationMessage(error))}`)
  }
}

export async function publishImportSelection(formData: FormData) {
  const user = await currentUser()
  const sessionId = String(formData.get('sessionId') ?? '')
  const candidateIds = formData.getAll('candidateId').map(String)
  await publishSelectedCandidates(db, user.id, sessionId, candidateIds)
  refreshPortfolio(user.handle)
  redirect('/settings/portfolio?notice=Showcase%20updated')
}
