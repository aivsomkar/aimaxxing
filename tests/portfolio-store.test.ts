import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import * as schema from '../src/db/schema'
import {
  addManualProject,
  createImportSession,
  getImportSession,
  listPortfolioProjects,
  publishSelectedCandidates,
  removePortfolioProject,
  reorderPortfolioProjects,
  updatePortfolioProject,
} from '../src/lib/portfolio-store'
import type { PortfolioCandidate } from '../src/lib/portfolio'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  client = new PGlite()
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: 'drizzle' })
})

afterAll(async () => {
  await client.close()
})

let userSeq = 0
async function makeUser() {
  userSeq += 1
  const handle = `portfolio-owner-${userSeq}`
  const [user] = await db.insert(schema.users).values({ githubId: handle, handle }).returning()
  return user
}

function candidate(externalId: string, liveUrl: string): PortfolioCandidate {
  return {
    externalId,
    source: 'github',
    title: `Project ${externalId}`,
    description: null,
    liveUrl,
    repositoryUrl: `https://github.com/owner/${externalId}`,
  }
}

describe('manual portfolio storage', () => {
  it('normalizes a manual project and updates a duplicate owner URL in place', async () => {
    const owner = await makeUser()
    const first = await addManualProject(db, owner.id, {
      title: ' Arena ',
      description: ' Shipped ',
      liveUrl: 'https://Arena.dev/',
    })
    const updated = await addManualProject(db, owner.id, {
      title: 'Arena v2',
      liveUrl: 'https://arena.dev',
    })

    expect(first).toMatchObject({
      source: 'manual',
      title: 'Arena',
      description: 'Shipped',
      liveUrl: 'https://arena.dev',
    })
    expect(updated.id).toBe(first.id)
    expect(updated.title).toBe('Arena v2')
    expect(await listPortfolioProjects(db, owner.id)).toHaveLength(1)
  })

  it('does not let another user update or remove a project', async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const project = await addManualProject(db, owner.id, {
      title: 'Owner site',
      liveUrl: 'https://owner.example.com',
    })

    await expect(updatePortfolioProject(db, other.id, project.id, {
      title: 'Stolen',
      liveUrl: 'https://stolen.example.com',
    })).rejects.toThrow('portfolio project not found')
    await expect(removePortfolioProject(db, other.id, project.id))
      .rejects.toThrow('portfolio project not found')
    expect((await listPortfolioProjects(db, owner.id))[0].title).toBe('Owner site')
  })

  it('reorders only when the submitted IDs exactly match the owner portfolio', async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const a = await addManualProject(db, owner.id, { title: 'A', liveUrl: 'https://a.example.com' })
    const b = await addManualProject(db, owner.id, { title: 'B', liveUrl: 'https://b.example.com' })
    const outsider = await addManualProject(db, other.id, {
      title: 'Outsider',
      liveUrl: 'https://outsider.example.com',
    })

    await expect(reorderPortfolioProjects(db, owner.id, [b.id, outsider.id]))
      .rejects.toThrow('portfolio order does not match owner projects')
    await reorderPortfolioProjects(db, owner.id, [b.id, a.id])
    expect((await listPortfolioProjects(db, owner.id)).map((p: { title: string }) => p.title))
      .toEqual(['B', 'A'])
  })
})

describe('portfolio import sessions', () => {
  it('is owner-scoped and unavailable after expiry', async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const now = new Date('2026-08-22T12:00:00Z')
    const session = await createImportSession(
      db,
      owner.id,
      'github',
      [candidate('one', 'https://one.example.com')],
      { now },
    )

    expect(await getImportSession(db, other.id, session.id, now)).toBeNull()
    expect(await getImportSession(db, owner.id, session.id, new Date('2026-08-22T12:31:00Z')))
      .toBeNull()
    expect(await getImportSession(db, owner.id, session.id, new Date('2026-08-22T12:29:00Z')))
      .toMatchObject({ id: session.id, source: 'github' })
  })

  it('publishes only selected candidates and consumes the session once', async () => {
    const owner = await makeUser()
    const now = new Date('2026-08-22T12:00:00Z')
    const session = await createImportSession(db, owner.id, 'github', [
      candidate('one', 'https://one.example.com'),
      candidate('two', 'https://two.example.com'),
    ], { now })

    const rows = await publishSelectedCandidates(db, owner.id, session.id, ['two'], now)
    expect(rows.map((p: { title: string }) => p.title)).toEqual(['Project two'])
    expect(await getImportSession(db, owner.id, session.id, now)).toBeNull()
    await expect(publishSelectedCandidates(db, owner.id, session.id, ['one'], now))
      .rejects.toThrow('portfolio import session not found')
  })
})
