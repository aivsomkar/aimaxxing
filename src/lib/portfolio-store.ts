import { and, asc, eq, gt } from 'drizzle-orm'
import { portfolioImportSessions, portfolioProjects } from '@/db/schema'
import {
  validateManualProject,
  type ManualProjectInput,
  type PortfolioCandidate,
} from '@/lib/portfolio'

type Database = {
  select: (...args: any[]) => any
  insert: (...args: any[]) => any
  update: (...args: any[]) => any
  delete: (...args: any[]) => any
  transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>
}

export class PortfolioValidationError extends Error {
  constructor(public readonly errors: Partial<Record<keyof ManualProjectInput, string>>) {
    super('invalid portfolio project')
  }
}

export async function listPortfolioProjects(database: Database, userId: number) {
  return database.select().from(portfolioProjects)
    .where(eq(portfolioProjects.userId, userId))
    .orderBy(asc(portfolioProjects.sortOrder), asc(portfolioProjects.id))
}

export async function addManualProject(
  database: Database,
  userId: number,
  input: ManualProjectInput,
) {
  const result = validateManualProject(input)
  if (!result.ok) throw new PortfolioValidationError(result.errors)

  const [existing] = await database.select().from(portfolioProjects)
    .where(and(
      eq(portfolioProjects.userId, userId),
      eq(portfolioProjects.liveUrl, result.value.liveUrl),
    ))

  if (existing) {
    const [updated] = await database.update(portfolioProjects)
      .set({
        source: 'manual',
        externalId: null,
        ...result.value,
        updatedAt: new Date(),
      })
      .where(and(eq(portfolioProjects.id, existing.id), eq(portfolioProjects.userId, userId)))
      .returning()
    return updated
  }

  const current = await listPortfolioProjects(database, userId)
  const [created] = await database.insert(portfolioProjects).values({
    userId,
    source: 'manual',
    ...result.value,
    sortOrder: current.length,
  }).returning()
  return created
}

export async function updatePortfolioProject(
  database: Database,
  userId: number,
  projectId: number,
  input: ManualProjectInput,
) {
  const result = validateManualProject(input)
  if (!result.ok) throw new PortfolioValidationError(result.errors)
  const [updated] = await database.update(portfolioProjects)
    .set({ ...result.value, updatedAt: new Date() })
    .where(and(eq(portfolioProjects.id, projectId), eq(portfolioProjects.userId, userId)))
    .returning()
  if (!updated) throw new Error('portfolio project not found')
  return updated
}

export async function removePortfolioProject(database: Database, userId: number, projectId: number) {
  const [removed] = await database.delete(portfolioProjects)
    .where(and(eq(portfolioProjects.id, projectId), eq(portfolioProjects.userId, userId)))
    .returning({ id: portfolioProjects.id })
  if (!removed) throw new Error('portfolio project not found')
}

export async function reorderPortfolioProjects(
  database: Database,
  userId: number,
  orderedProjectIds: number[],
) {
  return database.transaction(async (tx: any) => {
    const owned = await tx.select({ id: portfolioProjects.id }).from(portfolioProjects)
      .where(eq(portfolioProjects.userId, userId))
    const actual = owned.map((row: { id: number }) => row.id).sort((a: number, b: number) => a - b)
    const submitted = [...new Set(orderedProjectIds)].sort((a, b) => a - b)
    if (actual.length !== orderedProjectIds.length
      || actual.length !== submitted.length
      || actual.some((id: number, index: number) => id !== submitted[index])) {
      throw new Error('portfolio order does not match owner projects')
    }

    for (const [sortOrder, id] of orderedProjectIds.entries()) {
      await tx.update(portfolioProjects)
        .set({ sortOrder, updatedAt: new Date() })
        .where(and(eq(portfolioProjects.id, id), eq(portfolioProjects.userId, userId)))
    }

    return tx.select().from(portfolioProjects)
      .where(eq(portfolioProjects.userId, userId))
      .orderBy(asc(portfolioProjects.sortOrder), asc(portfolioProjects.id))
  })
}

export async function createImportSession(
  database: Database,
  userId: number,
  source: 'github' | 'vercel',
  candidates: PortfolioCandidate[],
  options: { now?: Date; stateHash?: string | null } = {},
) {
  const now = options.now ?? new Date()
  const [session] = await database.insert(portfolioImportSessions).values({
    userId,
    source,
    stateHash: options.stateHash ?? null,
    candidates,
    expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
  }).returning()
  return session
}

export async function getImportSession(
  database: Database,
  userId: number,
  sessionId: string,
  now = new Date(),
) {
  const [session] = await database.select().from(portfolioImportSessions)
    .where(and(
      eq(portfolioImportSessions.id, sessionId),
      eq(portfolioImportSessions.userId, userId),
      gt(portfolioImportSessions.expiresAt, now),
    ))
  return session ?? null
}

export async function getImportSessionByStateHash(
  database: Database,
  userId: number,
  source: 'github' | 'vercel',
  stateHash: string,
  now = new Date(),
) {
  const [session] = await database.select().from(portfolioImportSessions)
    .where(and(
      eq(portfolioImportSessions.userId, userId),
      eq(portfolioImportSessions.source, source),
      eq(portfolioImportSessions.stateHash, stateHash),
      gt(portfolioImportSessions.expiresAt, now),
    ))
  return session ?? null
}

export async function completeImportSession(
  database: Database,
  userId: number,
  sessionId: string,
  candidates: PortfolioCandidate[],
) {
  const [updated] = await database.update(portfolioImportSessions)
    .set({ candidates, stateHash: null })
    .where(and(
      eq(portfolioImportSessions.id, sessionId),
      eq(portfolioImportSessions.userId, userId),
    ))
    .returning({ id: portfolioImportSessions.id })
  if (!updated) throw new Error('portfolio import session not found')
  return candidates
}

async function upsertCandidate(tx: any, userId: number, candidate: PortfolioCandidate) {
  const [byLiveUrl] = await tx.select().from(portfolioProjects).where(and(
    eq(portfolioProjects.userId, userId),
    eq(portfolioProjects.liveUrl, candidate.liveUrl),
  ))
  const [byExternalId] = byLiveUrl ? [] : await tx.select().from(portfolioProjects).where(and(
    eq(portfolioProjects.userId, userId),
    eq(portfolioProjects.source, candidate.source),
    eq(portfolioProjects.externalId, candidate.externalId),
  ))
  const existing = byLiveUrl ?? byExternalId
  if (existing) {
    await tx.update(portfolioProjects).set({
      ...candidate,
      updatedAt: new Date(),
    }).where(and(eq(portfolioProjects.id, existing.id), eq(portfolioProjects.userId, userId)))
    return
  }

  const current = await tx.select({ id: portfolioProjects.id }).from(portfolioProjects)
    .where(eq(portfolioProjects.userId, userId))
  await tx.insert(portfolioProjects).values({
    userId,
    ...candidate,
    sortOrder: current.length,
  })
}

export async function publishSelectedCandidates(
  database: Database,
  userId: number,
  sessionId: string,
  candidateIds: string[],
  now = new Date(),
) {
  return database.transaction(async (tx: any) => {
    const [session] = await tx.select().from(portfolioImportSessions).where(and(
      eq(portfolioImportSessions.id, sessionId),
      eq(portfolioImportSessions.userId, userId),
      gt(portfolioImportSessions.expiresAt, now),
    ))
    if (!session) throw new Error('portfolio import session not found')

    const selectedIds = new Set(candidateIds)
    const candidates = (session.candidates as PortfolioCandidate[])
      .filter((candidate) => selectedIds.has(candidate.externalId))
    for (const candidate of candidates) await upsertCandidate(tx, userId, candidate)

    await tx.delete(portfolioImportSessions).where(and(
      eq(portfolioImportSessions.id, sessionId),
      eq(portfolioImportSessions.userId, userId),
    ))

    return tx.select().from(portfolioProjects)
      .where(eq(portfolioProjects.userId, userId))
      .orderBy(asc(portfolioProjects.sortOrder), asc(portfolioProjects.id))
  })
}
