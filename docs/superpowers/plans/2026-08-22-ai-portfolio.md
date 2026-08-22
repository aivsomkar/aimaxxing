# AI Portfolio Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a curated live-project portfolio to public profiles with GitHub, Vercel, and manual snapshot imports, plus a project-aware profile share card.

**Architecture:** Store only user-published portfolio rows and short-lived sanitized import candidates. Keep provider adapters pure at their mapping boundary, keep owner-scoped database mutations in `portfolio-store.ts`, and keep pages/routes as thin authentication and rendering adapters. GitHub uses public repository metadata; Vercel uses a one-time integration token that is discarded after candidate creation.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Drizzle ORM, PostgreSQL/Neon, PGlite integration tests, Auth.js 5, Vitest, Vercel REST API.

**Spec:** `docs/superpowers/specs/2026-08-22-ai-portfolio-design.md`

## Global Constraints

- AI usage remains account-level; no per-project token, model, cost, tool, prompt, repository, or session fields.
- Imported rows stay private until the user selects them.
- Provider access tokens never reach client code or persistent storage.
- Existing public profile consent continues through `canAppearOnBoards`.
- Public queries expose no external IDs, import sessions, GitHub IDs, or provider credentials.
- Work directly on `main`; the user explicitly requested no feature branches.
- Every behavior change follows red-green-refactor.

---

### Task 1: Portfolio schema and migration

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `tests/schema.test.ts`
- Create: generated `drizzle/0001_*.sql`
- Modify: generated `drizzle/meta/_journal.json`
- Create: generated `drizzle/meta/0001_snapshot.json`

**Interfaces:**
- Produces: `users.githubLogin`, `portfolioProjects`, `portfolioImportSessions`
- Consumes: existing `users.id` integer primary key and cascade-delete convention

- [ ] **Step 1: Write the failing schema tests**

Add assertions that `githubLogin` exists, both portfolio tables reference `users.id`, published projects have unique indexes for `(user_id, live_url)` and `(user_id, source, external_id)`, and import sessions have JSON candidates plus an expiry.

```ts
import { users, toolDays, collectiveDays, portfolioProjects, portfolioImportSessions } from '../src/db/schema'

it('stores the GitHub login separately from the stable public handle', () => {
  expect(users.githubLogin.name).toBe('github_login')
})

it('prevents duplicate portfolio URLs and imported project IDs per user', () => {
  const uniques = getTableConfig(portfolioProjects).indexes.filter((i) => i.config.unique)
  expect(uniques.map((i) => i.config.columns.map((c: any) => c.name)))
    .toEqual(expect.arrayContaining([
      ['user_id', 'live_url'],
      ['user_id', 'source', 'external_id'],
    ]))
})

it('stores private import candidates with an expiry', () => {
  expect(portfolioImportSessions.candidates.dataType).toBe('json')
  expect(portfolioImportSessions.expiresAt.notNull).toBe(true)
})
```

- [ ] **Step 2: Run the schema test and observe RED**

Run: `pnpm vitest run tests/schema.test.ts`

Expected: TypeScript/module failure because the portfolio exports and `githubLogin` do not exist.

- [ ] **Step 3: Add the schema**

Use `jsonb` and `uuid` from `drizzle-orm/pg-core`. Define:

```ts
githubLogin: text('github_login'),

export const portfolioProjects = pgTable('portfolio_projects', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  source: text('source').notNull(),
  externalId: text('external_id'),
  title: text('title').notNull(),
  description: text('description'),
  liveUrl: text('live_url').notNull(),
  repositoryUrl: text('repository_url'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  userLiveUrl: uniqueIndex('portfolio_projects_user_live_url_uniq').on(t.userId, t.liveUrl),
  userSourceExternal: uniqueIndex('portfolio_projects_user_source_external_uniq')
    .on(t.userId, t.source, t.externalId),
}))

export const portfolioImportSessions = pgTable('portfolio_import_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  source: text('source').notNull(),
  stateHash: text('state_hash'),
  candidates: jsonb('candidates').notNull().default([]),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
```

- [ ] **Step 4: Generate and inspect the migration**

Run: `pnpm db:generate`

Expected: one migration adding `github_login`, both tables, foreign keys, and both unique indexes. Inspect the SQL and reject any drop/truncate statement.

- [ ] **Step 5: Run schema and drift tests GREEN**

Run: `pnpm vitest run tests/schema.test.ts tests/schema-drift.test.ts`

Expected: both files pass.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts tests/schema.test.ts drizzle
git commit -m "feat: add AI portfolio data model"
```

---

### Task 2: URL normalization and provider candidate mapping

**Files:**
- Create: `src/lib/portfolio.ts`
- Create: `tests/portfolio.test.ts`

**Interfaces:**
- Produces: `PortfolioSource`, `PortfolioCandidate`, `GitHubRepo`, `VercelProject`, `normalizeLiveUrl`, `normalizeRepositoryUrl`, `githubRepoToCandidate`, `vercelProjectToCandidate`, `validateManualProject`
- Consumes: no database or network dependencies

- [ ] **Step 1: Write failing URL and mapper tests**

Use literal expected objects. Cover HTTPS normalization, fragment removal, root-slash removal, rejection of credentials/localhost/non-web schemes, archived/forked GitHub rows, and Vercel production-domain preference.

```ts
expect(normalizeLiveUrl('HTTPS://Example.COM/#work')).toBe('https://example.com')
expect(normalizeLiveUrl('https://user:pass@example.com')).toBeNull()
expect(normalizeLiveUrl('http://localhost:3000')).toBeNull()

expect(githubRepoToCandidate({
  id: 42, name: 'arena', description: 'Public proof', homepage: 'https://arena.dev/',
  html_url: 'https://github.com/omkar/arena', fork: false, archived: false, disabled: false,
})).toEqual({
  externalId: '42', source: 'github', title: 'arena', description: 'Public proof',
  liveUrl: 'https://arena.dev', repositoryUrl: 'https://github.com/omkar/arena',
})

expect(vercelProjectToCandidate({
  id: 'prj_1', name: 'arena', productionDomains: ['arena.vercel.app', 'arena.dev'],
})).toEqual({
  externalId: 'prj_1', source: 'vercel', title: 'arena', description: null,
  liveUrl: 'https://arena.dev', repositoryUrl: null,
})
```

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run tests/portfolio.test.ts`

Expected: module-not-found for `src/lib/portfolio.ts`.

- [ ] **Step 3: Implement the pure contracts**

`normalizeLiveUrl` must parse with `new URL`, require `http:` or `https:`, reject username/password, reject `localhost`, loopback IPv4, and `[::1]`, lowercase the hostname through URL serialization, clear `hash`, and remove `/` only when it is the root pathname. `validateManualProject` returns a discriminated result:

```ts
type ManualProjectInput = { title: string; description?: string; liveUrl: string; repositoryUrl?: string }
type ValidationResult =
  | { ok: true; value: { title: string; description: string | null; liveUrl: string; repositoryUrl: string | null } }
  | { ok: false; errors: Partial<Record<keyof ManualProjectInput, string>> }
```

Titles are 1–80 trimmed characters; descriptions are at most 180; repository URLs must use `github.com`.

- [ ] **Step 4: Run GREEN and mutation-check boundaries**

Run: `pnpm vitest run tests/portfolio.test.ts`

Expected: all tests pass. Mentally verify tests fail if protocol checks, fork checks, domain preference, or length limits are removed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/portfolio.ts tests/portfolio.test.ts
git commit -m "feat: validate portfolio sites and import candidates"
```

---

### Task 3: Owner-scoped portfolio storage and deletion

**Files:**
- Create: `src/lib/portfolio-store.ts`
- Create: `tests/portfolio-store.test.ts`
- Modify: `src/lib/account.ts`
- Modify: `tests/account.test.ts`

**Interfaces:**
- Consumes: `portfolioProjects`, `portfolioImportSessions`, `PortfolioCandidate`, `validateManualProject`
- Produces: `listPortfolioProjects`, `addManualProject`, `updatePortfolioProject`, `removePortfolioProject`, `reorderPortfolioProjects`, `createImportSession`, `getImportSession`, `publishSelectedCandidates`

- [ ] **Step 1: Write failing PGlite integration tests**

Create an in-memory migrated database. Assert manual insert normalization, same-owner URL upsert, cross-owner update/delete rejection, exact reorder ownership, expired session rejection, selected-only publishing, session single-use deletion, and `deleteAllDataForUser` removing both projects and import sessions.

```ts
const saved = await addManualProject(db, owner.id, {
  title: ' Arena ', liveUrl: 'https://Arena.dev/', description: ' Shipped ',
})
expect(saved).toMatchObject({ title: 'Arena', liveUrl: 'https://arena.dev', description: 'Shipped' })

await expect(removePortfolioProject(db, other.id, saved.id)).rejects.toThrow('not found')
```

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run tests/portfolio-store.test.ts tests/account.test.ts`

Expected: module-not-found/new cleanup assertion failure.

- [ ] **Step 3: Implement transactional owner-scoped storage**

Use a small structural `Database` type compatible with PGlite and node-postgres Drizzle. All update/delete predicates combine project/session ID with `userId`. `publishSelectedCandidates` loads the owner’s unexpired session, filters candidate IDs against the persisted JSON, inserts/upserts only selected rows in a transaction, and deletes the session before returning the ordered projects.

- [ ] **Step 4: Extend delete-everything**

Inside the existing account transaction, delete `portfolioImportSessions` and `portfolioProjects` before clearing user consent fields.

- [ ] **Step 5: Run GREEN**

Run: `pnpm vitest run tests/portfolio-store.test.ts tests/account.test.ts`

Expected: all storage and account tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/portfolio-store.ts src/lib/account.ts tests/portfolio-store.test.ts tests/account.test.ts
git commit -m "feat: add owner-scoped portfolio storage"
```

---

### Task 4: GitHub snapshot import and login refresh

**Files:**
- Create: `src/lib/github-portfolio.ts`
- Create: `tests/github-portfolio.test.ts`
- Modify: `src/auth.ts`
- Modify: `tests/handle.test.ts`

**Interfaces:**
- Consumes: `githubRepoToCandidate`, `createImportSession`, `users.githubLogin`
- Produces: `fetchGitHubPortfolioCandidates(login, fetcher?)`

- [ ] **Step 1: Write failing importer tests**

Inject `fetcher: typeof fetch`. Return a literal GitHub response containing one valid site, one fork, and one repo without a homepage. Assert only the valid candidate survives. Assert non-2xx responses throw `GitHub import failed (STATUS)` without persisting anything.

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run tests/github-portfolio.test.ts`

Expected: module-not-found.

- [ ] **Step 3: Implement the GitHub adapter**

Request:

```ts
https://api.github.com/users/${encodeURIComponent(login)}/repos?type=owner&sort=updated&per_page=100
```

Send `Accept: application/vnd.github+json` and the current GitHub API version header. Parse only arrays; map through `githubRepoToCandidate`; deduplicate by `liveUrl`.

- [ ] **Step 4: Refresh `githubLogin` in Auth.js**

In the sign-in callback, derive `githubLogin = String(profile.login ?? '') || null`. Existing users receive an update to `githubLogin` and `avatarUrl`; new users insert both. Do not change a returning user’s stable public `handle`.

- [ ] **Step 5: Run GREEN and auth-related tests**

Run: `pnpm vitest run tests/github-portfolio.test.ts tests/handle.test.ts tests/account.test.ts`

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/github-portfolio.ts src/auth.ts tests/github-portfolio.test.ts tests/handle.test.ts
git commit -m "feat: import live GitHub projects"
```

---

### Task 5: Public profile query and project grid

**Files:**
- Modify: `src/lib/queries.ts`
- Modify: `tests/queries.test.ts`
- Create: `src/components/PortfolioGrid.tsx`
- Create: `tests/portfolio-components.test.tsx`
- Modify: `src/app/[handle]/page.tsx`

**Interfaces:**
- Consumes: `portfolioProjects`
- Produces: `getProfile(...).projects` narrow public projection and `PortfolioGrid({ projects })`

- [ ] **Step 1: Write failing public-query and grid tests**

Seed two ordered projects plus one import session. Assert `getProfile(handle).projects` contains only `id`, `source`, `title`, `description`, `liveUrl`, `repositoryUrl`, and `sortOrder` in sort order. Assert no `externalId`, `userId`, `stateHash`, or candidates are reachable.

In `tests/portfolio-components.test.tsx`, use `renderToStaticMarkup` from `react-dom/server` and assert an empty grid renders an empty string while two projects render `BUILT · 2 LIVE PROJECTS`, both titles, and safe external-link attributes.

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run tests/queries.test.ts tests/portfolio-components.test.tsx`

Expected: `projects` is missing.

- [ ] **Step 3: Add the narrow query**

After the existing public/has-data gate succeeds, select project fields by `userId`, order by `sortOrder` then `id`, and return `projects` beside the existing account-level totals.

- [ ] **Step 4: Build `PortfolioGrid` and render it**

Render nothing for an empty array. Otherwise render the `BUILT · N LIVE PROJECT(S)` label and responsive grid. Each anchor uses `target="_blank"` and `rel="noreferrer noopener"`, shows title, `new URL(liveUrl).hostname`, optional description, source, and `↗`.

- [ ] **Step 5: Run query tests and typecheck**

Run: `pnpm vitest run tests/queries.test.ts tests/portfolio-components.test.tsx && pnpm typecheck`

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/queries.ts tests/queries.test.ts tests/portfolio-components.test.tsx src/components/PortfolioGrid.tsx 'src/app/[handle]/page.tsx'
git commit -m "feat: showcase live projects on public profiles"
```

---

### Task 6: Portfolio settings, manual entry, and GitHub selection

**Files:**
- Create: `src/app/settings/portfolio/page.tsx`
- Create: `src/app/settings/portfolio/actions.ts`
- Create: `src/components/PortfolioManager.tsx`
- Modify: `src/app/settings/page.tsx`

**Interfaces:**
- Consumes: portfolio-store functions, `fetchGitHubPortfolioCandidates`, Auth.js current user pattern
- Produces: server actions `addManual`, `editProject`, `removeProject`, `reorderProjects`, `startGitHubImport`, `publishImportSelection`

- [ ] **Step 1: Write the failing management-component test**

Extend `tests/portfolio-components.test.tsx` with `renderToStaticMarkup(<PortfolioManager projects={[]} importSession={null} />)`. Assert the observable controls `Import from GitHub`, `Connect Vercel`, `Add another website`, and form field names `title`, `liveUrl`, `description`, and `repositoryUrl`. The production change that makes it pass is the new management component, not a framework mock.

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run tests/portfolio-components.test.tsx`

Expected: module-not-found for `PortfolioManager`.

- [ ] **Step 3: Implement authenticated server actions**

Reuse the current-user lookup pattern from settings. `startGitHubImport` requires `githubLogin`, fetches candidates, creates a 30-minute GitHub import session, and redirects to `/settings/portfolio?import=<id>`. Mutation actions revalidate the settings page and `/@handle`.

- [ ] **Step 4: Build the management page**

The server page loads published projects and an owner-scoped import session from the query string. `PortfolioManager` renders published rows, selection checkboxes, “Add selected,” GitHub import, Vercel connect link, and manual fields for title, live URL, optional description, and optional repository URL. Empty and error copy must explain the next action.

- [ ] **Step 5: Link from Settings**

Add a concise Portfolio section linking to `/settings/portfolio`; keep privacy and deletion sections unchanged.

- [ ] **Step 6: Verify focused tests and typecheck**

Run: `pnpm vitest run tests/portfolio.test.ts tests/portfolio-store.test.ts tests/github-portfolio.test.ts tests/portfolio-components.test.tsx && pnpm typecheck`

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add src/app/settings src/components/PortfolioManager.tsx
git commit -m "feat: manage curated AI portfolio projects"
```

---

### Task 7: Project-aware profile share card

**Files:**
- Create: `src/lib/share-card.ts`
- Create: `tests/share-card.test.ts`
- Create: `src/app/[handle]/opengraph-image.tsx`

**Interfaces:**
- Consumes: `getProfile`, `computeIndex`, `formatUsd`, `canAppearOnBoards`
- Produces: `decodeShareHandle`, `buildShareCardData`, a 1200×630 PNG route

- [ ] **Step 1: Write failing share-card tests**

Assert `%40omkar`, `@omkar`, and `omkar` resolve to `omkar`. Use hand-derived data where two qualifying tools plus output produce Index `14.0`; assert spend `$125.50`, verification label, singular/plural tool copy, and `projectCount`/project label.

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run tests/share-card.test.ts`

Expected: module-not-found.

- [ ] **Step 3: Implement the pure view model**

`buildShareCardData(profile)` returns formatted strings and counts only; it must call the shared Index and money helpers rather than reimplementing formulas.

- [ ] **Step 4: Implement the image route**

Decode the route handle, load the consent-gated profile, call `notFound()` when absent, and return `ImageResponse` with the approved ink/bone/orange arena score-rail composition. Export `size = { width: 1200, height: 630 }` and `contentType = 'image/png'`.

- [ ] **Step 5: Run focused tests and build**

Run: `pnpm vitest run tests/share-card.test.ts && DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build pnpm build`

Expected: tests and production build pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/share-card.ts tests/share-card.test.ts 'src/app/[handle]/opengraph-image.tsx'
git commit -m "feat: generate portfolio profile share cards"
```

---

### Task 8: Vercel snapshot import

**Files:**
- Create: `src/lib/vercel-portfolio.ts`
- Create: `tests/vercel-portfolio.test.ts`
- Create: `src/app/api/integrations/vercel/start/route.ts`
- Create: `src/app/api/integrations/vercel/callback/route.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `vercelProjectToCandidate`, import-session store, Auth.js current user
- Produces: `createVercelAuthorizationUrl`, `hashImportState`, `verifyImportState`, `exchangeVercelCode`, `fetchVercelPortfolioCandidates`, start/callback routes

- [ ] **Step 1: Write failing adapter tests**

Inject fetch. Assert authorization URLs carry state, state hashes verify and reject a different value, token exchange rejects non-2xx without leaking bodies, project/domain responses map to sanitized candidates, custom domains beat `vercel.app`, and no returned value contains `access_token`.

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run tests/vercel-portfolio.test.ts`

Expected: module-not-found.

- [ ] **Step 3: Implement the Vercel adapter**

Read integration credentials only inside server functions. Exchange callback codes at `https://api.vercel.com/v2/oauth/access_token`. Fetch granted projects from `https://api.vercel.com/v9/projects?limit=100` with the returned team scope, then retrieve project domains as needed. Return sanitized candidates only.

- [ ] **Step 4: Implement start and callback routes**

Start creates a 30-minute session with `stateHash = sha256(state)` and redirects to `https://vercel.com/integrations/${slug}/new?state=...`. Callback authenticates the same user, verifies the hash with timing-safe comparison, exchanges/fetches in request memory, stores candidates, clears `stateHash`, and redirects to selection. Canceled consent redirects with `vercel=canceled`; invalid/replayed state returns 404.

- [ ] **Step 5: Add environment names**

Append without values:

```dotenv
VERCEL_INTEGRATION_ID=
VERCEL_INTEGRATION_CLIENT_SECRET=
VERCEL_INTEGRATION_SLUG=
```

- [ ] **Step 6: Run focused tests and typecheck**

Run: `pnpm vitest run tests/vercel-portfolio.test.ts tests/portfolio-store.test.ts && pnpm typecheck`

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/vercel-portfolio.ts tests/vercel-portfolio.test.ts src/app/api/integrations/vercel .env.example
git commit -m "feat: import selected Vercel projects"
```

---

### Task 9: Full verification, migration, push, and production deployment

**Files:**
- Modify only if verification reveals a tested defect

**Interfaces:**
- Consumes: all prior tasks
- Produces: migrated Neon schema and live Vercel deployment from `main`

- [ ] **Step 1: Run the complete local verification**

```bash
pnpm test
pnpm typecheck
DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build pnpm build
git diff --check
```

Expected: all tests pass, typecheck/build exit 0, no whitespace errors.

- [ ] **Step 2: Push `main`**

Run: `git push origin main`

- [ ] **Step 3: Apply the migration to Neon before deploying code**

Load the linked `.env.local` without printing it and run `pnpm db:migrate`. Expected: `Migrations applied`.

- [ ] **Step 4: Configure Vercel integration variables when credentials exist**

Store ID/slug as normal configuration and the client secret as sensitive for production/preview. If the dashboard integration has not been created, leave Vercel import visibly unconfigured; manual and GitHub portfolio flows remain usable.

- [ ] **Step 5: Deploy production**

Run: `pnpm dlx vercel@latest deploy --prod --yes --scope aivsomkars-projects`

Expected: deployment reaches `READY` and aliases `https://aimaxxing.vercel.app`.

- [ ] **Step 6: Smoke-test**

Verify homepage and collective API return 200, an opted-in seeded profile renders project cards, its Open Graph image returns `content-type: image/png`, and `/settings/portfolio` redirects anonymous users to sign-in.

- [ ] **Step 7: Confirm repository state**

Run: `git status --short --branch` and `git ls-remote --heads origin`.

Expected: clean `main`, synchronized with `origin/main`, with no extra remote branches.
