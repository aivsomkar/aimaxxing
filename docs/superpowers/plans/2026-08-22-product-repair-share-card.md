# Product Repair and Share Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair first-login activation, owner profile previews, GitHub output sync, public publishing, Methodology, and the shareable AI Maxxing card.

**Architecture:** Separate raw profile reads from viewer-aware publication gates, keep OAuth provisioning independent from best-effort GitHub synchronization, and use one card-data formatter and one card view for profile previews, Open Graph, and downloads. Authenticated pages remain thin adapters over tested library and presentational components.

**Tech Stack:** Next.js 15 App Router, React 19, Auth.js 5 beta, TypeScript 5.8, Drizzle ORM 0.44, Postgres/PGlite, Tailwind 4, Zod 3, Vitest 3

**Spec:** `docs/superpowers/specs/2026-08-22-product-repair-share-card-design.md`

## Global Constraints

- Public publishing remains explicit opt-in.
- The matching owner can always preview their private profile.
- GitHub OAuth tokens must never be persisted or logged.
- GitHub and provider project imports remain private until selection.
- Public profile, JSON, Open Graph, and downloadable card values use the same query and formatting helpers.
- Vercel importing remains unavailable.
- All repaired UI targets WCAG 2.2 AA and reduced-motion support.
- All work lands directly on `main`; do not create a branch.

---

### Task 1: Provision Accounts and Synchronize GitHub Output

**Files:**
- Create: `src/lib/auth-account.ts`
- Create: `src/lib/github-output.ts`
- Create: `tests/auth-account.test.ts`
- Create: `tests/github-output.test.ts`
- Modify: `src/auth.ts`

**Interfaces:**
- Consumes: `githubIdentityFromProfile(profile)`, `users`, `githubStats`, Auth.js `profile` and `account.access_token`
- Produces: `provisionGitHubAccount(database, identity): Promise<UserRow>`, `fetchGitHubOutput(accessToken, login, now?, fetcher?): Promise<GitHubOutput>`, `upsertGitHubOutput(database, userId, output): Promise<void>`

- [ ] **Step 1: Write failing GitHub mapping tests**

Create fixtures that return `search.issueCount`, `viewer.contributionsCollection.contributionCalendar.totalContributions`, `restrictedContributionsCount`, and repositories with archived and pushed timestamps. Assert:

```ts
expect(await fetchGitHubOutput('token', 'aivsomkar', new Date('2026-08-22T00:00:00Z'), fetcher))
  .toEqual({ mergedPrs: 14, activeRepos: 2, contributions: 321 })
expect(seenAuthorization).toBe('Bearer token')
```

Also assert non-2xx, GraphQL `errors`, missing viewer, negative counts, and invalid timestamps reject with stable `GitHubOutputError` codes without including the access token.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm vitest run tests/github-output.test.ts`

Expected: FAIL because `src/lib/github-output.ts` does not exist.

- [ ] **Step 3: Implement the GitHub adapter**

Define:

```ts
export type GitHubOutput = {
  mergedPrs: number
  activeRepos: number
  contributions: number
}
```

Send one GraphQL request to `https://api.github.com/graphql` with `Authorization: Bearer ${accessToken}` and `X-GitHub-Api-Version: 2026-03-10`. Count active owned repositories as non-archived nodes with `pushedAt >= now - 90 days`. Use `contributionCalendar.totalContributions` as the contribution count; do not add `restrictedContributionsCount` a second time because GitHub documents the calendar as the collection total. Query private/internal counts through the provider’s `read:user` scope.

- [ ] **Step 4: Write failing account-provisioning and upsert tests**

Use isolated PGlite. Assert a new identity inserts once, a returning identity keeps its stable handle while refreshing login/avatar, and output upsert creates then updates exactly one `github_stats` row.

```ts
const first = await provisionGitHubAccount(db, identity)
const returning = await provisionGitHubAccount(db, { ...identity, githubLogin: 'renamed' })
expect(returning.id).toBe(first.id)
expect(returning.handle).toBe(first.handle)
```

- [ ] **Step 5: Run provisioning tests and verify RED**

Run: `pnpm vitest run tests/auth-account.test.ts`

Expected: FAIL because `provisionGitHubAccount` and `upsertGitHubOutput` are absent.

- [ ] **Step 6: Implement provisioning and connect Auth.js**

Move database account creation out of `src/auth.ts`. Configure GitHub with `authorization: { params: { scope: 'read:user' } }`. In `signIn({ profile, account })`, provision first, then attempt sync only when `account?.access_token` and login exist:

```ts
const user = await provisionGitHubAccount(db, identity)
if (account?.access_token && identity.githubLogin) {
  try {
    const output = await fetchGitHubOutput(account.access_token, identity.githubLogin)
    await upsertGitHubOutput(db, user.id, output)
  } catch (error) {
    console.error('github_output_sync_failed', safeGitHubError(error))
  }
}
return true
```

Never log `account`, headers, GraphQL bodies, or tokens.

- [ ] **Step 7: Verify GREEN and regressions**

Run: `pnpm vitest run tests/auth-account.test.ts tests/github-output.test.ts tests/github-portfolio.test.ts tests/handle.test.ts && pnpm typecheck`

Expected: all tests and typecheck pass.

- [ ] **Step 8: Commit**

```bash
git add src/auth.ts src/lib/auth-account.ts src/lib/github-output.ts tests/auth-account.test.ts tests/github-output.test.ts
git commit -m "feat: sync GitHub output on sign in"
```

---

### Task 2: Split Profile Reads from Publication Gates

**Files:**
- Modify: `src/lib/consent.ts`
- Modify: `src/lib/queries.ts`
- Modify: `tests/consent.test.ts`
- Modify: `tests/queries.test.ts`
- Modify: `src/app/[handle]/page.tsx`
- Modify: `src/app/api/v1/profile/[handle]/route.ts`

**Interfaces:**
- Consumes: `users`, `toolDays`, `githubStats`, `portfolioProjects`, current viewer handle
- Produces: `ProfileRecord`, `getProfileRecord`, `getPublicProfile`, `getProfileForViewer`, `hasShowcaseContent`

- [ ] **Step 1: Write failing consent and query tests**

Add tests proving:

```ts
expect(hasShowcaseContent({ usageRows: 0, projects: 1, mergedPrs: 0, contributions: 0 })).toBe(true)
expect(hasShowcaseContent({ usageRows: 0, projects: 0, mergedPrs: 0, contributions: 0 })).toBe(false)
```

For an unlisted empty user, `getProfileForViewer('owner', 'owner')` returns an owner preview while `getPublicProfile('owner')` returns null. For an opted-in project-only user, `getPublicProfile` returns the project but `getEntrants('all')` remains empty. Assert model groups and token totals are correct across multiple rows.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm vitest run tests/consent.test.ts tests/queries.test.ts`

Expected: FAIL on missing profile-layer functions and project-only publication behavior.

- [ ] **Step 3: Implement profile layers**

Add `ProfileRecord` exactly as specified. Query projects and output before applying the public gate. Aggregate tools, models, token types, spend, and verification once inside `getProfileRecord`. Implement:

```ts
export async function getPublicProfile(handle: string) {
  const profile = await getProfileRecord(handle)
  if (!profile?.user.publicOptIn || !hasShowcaseContent(summaryOf(profile))) return null
  return profile
}

export async function getProfileForViewer(handle: string, viewerHandle: string | null) {
  const profile = await getProfileRecord(handle)
  if (!profile) return null
  const isOwner = viewerHandle === profile.user.handle
  const isPublic = profile.user.publicOptIn && hasShowcaseContent(summaryOf(profile))
  return isOwner || isPublic ? { profile, isOwner, isPublic } : null
}
```

Keep `getProfile` as a temporary alias to `getPublicProfile` only until all existing callers migrate, then remove it in this task.

- [ ] **Step 4: Update page and JSON consumers**

The profile page calls `auth()` and `getProfileForViewer`. Render a private-preview status for the owner. Render usage, output, and projects independently, with honest empty states. The public JSON route calls only `getPublicProfile` and adds token/model fields from `ProfileRecord` without exposing private identifiers.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm vitest run tests/consent.test.ts tests/queries.test.ts tests/share-card.test.ts && pnpm typecheck`

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/consent.ts src/lib/queries.ts src/app/'[handle]'/page.tsx src/app/api/v1/profile/'[handle]'/route.ts tests/consent.test.ts tests/queries.test.ts
git commit -m "feat: add private owner profile previews"
```

---

### Task 3: Add Authenticated Navigation and First-Login Routing

**Files:**
- Create: `src/components/HeaderNav.tsx`
- Create: `src/app/signin/page.tsx`
- Create: `tests/header.test.tsx`
- Modify: `src/components/Header.tsx`
- Modify: `src/auth.ts`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: Auth.js `auth`, `signIn`, `signOut`, session handle/public state
- Produces: `HeaderNav({ viewer })`, branded `/signin`, signed-in activation notice

- [ ] **Step 1: Write failing header tests**

Render the pure `HeaderNav` with `viewer=null` and with `{ handle: 'aivsomkar', publicOptIn: false }`. Assert anonymous navigation contains Sign in and no Settings; authenticated navigation contains `@aivsomkar`, Settings, and Sign out. Assert Methodology always links to `/methodology`.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm vitest run tests/header.test.tsx`

Expected: FAIL because `HeaderNav` does not exist.

- [ ] **Step 3: Implement auth-aware header**

Keep `Header` as a server component that calls `auth()` and passes a narrow viewer shape. Use server-action forms for sign-out and semantic links for navigation. Make the nav wrap at narrow widths and provide 44-pixel targets.

- [ ] **Step 4: Implement branded sign-in and callback behavior**

Set `pages: { signIn: '/signin' }` in Auth.js. The `/signin` page posts to:

```ts
async function login() {
  'use server'
  await signIn('github', { redirectTo: '/settings' })
}
```

Protected route redirects continue including their callback URL. Add a signed-in homepage notice linking to Settings when an account has no public showcase signal.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm vitest run tests/header.test.tsx tests/social-components.test.tsx && pnpm typecheck && pnpm build`

Expected: header tests, typecheck, and build pass; route output contains `/signin`.

- [ ] **Step 6: Commit**

```bash
git add src/auth.ts src/components/Header.tsx src/components/HeaderNav.tsx src/app/signin/page.tsx src/app/page.tsx tests/header.test.tsx
git commit -m "feat: route signed-in users to their dashboard"
```

---

### Task 4: Turn Settings into an Activation Dashboard

**Files:**
- Create: `src/components/AccountDashboard.tsx`
- Create: `src/lib/account-status.ts`
- Create: `tests/account-dashboard.test.tsx`
- Create: `tests/account-status.test.ts`
- Modify: `src/app/settings/page.tsx`
- Modify: `src/app/settings/actions.ts`
- Modify: `src/app/settings/portfolio/page.tsx`

**Interfaces:**
- Consumes: user row, output sync row, usage and project counts
- Produces: `AccountStatus`, `getAccountStatus(database, userId)`, activation dashboard and publication actions

- [ ] **Step 1: Write failing account-status tests**

Assert status distinguishes private-empty, private-ready, public, GitHub-sync-missing, project count, usage count, and output values. Assert `canPublish` is true only with usage, selected projects, or non-zero output.

- [ ] **Step 2: Write failing dashboard component tests**

Render private-empty and public states. Assert the ordered steps GitHub connected, Show live work, Connect AI usage, and Publish and share. Assert only one publication-state action is rendered. Assert private preview links to `/@handle`.

- [ ] **Step 3: Verify RED**

Run: `pnpm vitest run tests/account-status.test.ts tests/account-dashboard.test.tsx`

Expected: FAIL because the dashboard modules do not exist.

- [ ] **Step 4: Implement status queries and dashboard**

Use aggregate count queries rather than loading complete usage/project rows. Replace the current Settings sections with `AccountDashboard`; retain X settings, portfolio management, privacy explanation, and deletion within the new hierarchy. The Connect AI usage step links to manual reporting in this plan; the reporter plan extends it with device status after reporter tables exist.

- [ ] **Step 5: Harden publication and deletion actions**

`setPublicOptIn(true)` checks `canPublish` and redirects to a useful error when empty. Both publish and unpublish redirect with notices. Deletion requires a form value exactly matching the current handle and rejects any mismatch before calling `deleteAllDataForUser`.

- [ ] **Step 6: Verify GREEN**

Run: `pnpm vitest run tests/account-status.test.ts tests/account-dashboard.test.tsx tests/account.test.ts tests/portfolio-components.test.tsx && pnpm typecheck`

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/AccountDashboard.tsx src/lib/account-status.ts src/app/settings/page.tsx src/app/settings/actions.ts src/app/settings/portfolio/page.tsx tests/account-status.test.ts tests/account-dashboard.test.tsx
git commit -m "feat: add account activation dashboard"
```

---

### Task 5: Repair Manual Reporting and Methodology

**Files:**
- Create: `src/components/ManualReportForm.tsx`
- Create: `src/app/methodology/page.tsx`
- Create: `src/components/MethodologyContent.tsx`
- Create: `tests/manual-report-components.test.tsx`
- Create: `tests/methodology.test.tsx`
- Modify: `src/lib/manual-report.ts`
- Modify: `src/app/report/actions.ts`
- Modify: `src/app/report/page.tsx`
- Modify: `src/lib/handle.ts`
- Modify: `tests/manual-report.test.ts`
- Modify: `tests/handle.test.ts`

**Interfaces:**
- Consumes: `reportSchema`, Index constants, current user
- Produces: field-level manual report state, `/methodology`, reserved-handle behavior

- [ ] **Step 1: Write failing manual report tests**

Add optional numeric fields `tokensIn`, `tokensOut`, `cacheRead`, and `cacheWrite`. Assert at least one of sessions, spend, or token counts is positive. Assert valid values normalize, invalid values return named field errors, and manual rows remain `verified: false`.

- [ ] **Step 2: Write failing Methodology and reserved-handle tests**

Render `MethodologyContent` and assert the exact imported qualification, output cap, and contribution-unit constants appear. Add `deriveHandle('methodology', existing)` and every reserved product segment, expecting a suffixed safe handle such as `methodology-2`.

- [ ] **Step 3: Verify RED**

Run: `pnpm vitest run tests/manual-report.test.ts tests/manual-report-components.test.tsx tests/methodology.test.tsx tests/handle.test.ts`

Expected: FAIL on token inputs, positive-total validation, missing methodology, and reserved handles.

- [ ] **Step 4: Implement the report form and action state**

Use `useActionState` in `ManualReportForm` with a server action returning:

```ts
type ManualReportState = {
  status: 'idle' | 'error' | 'success'
  message: string
  errors: Partial<Record<'tool' | 'model' | 'day' | 'sessions' | 'tokensIn' | 'tokensOut' | 'cacheRead' | 'cacheWrite' | 'costUsd', string>>
}
```

Associate each error with `aria-describedby`; show success with a link to the owner preview and dashboard.

- [ ] **Step 5: Implement Methodology and reserved handles**

Create the route from the approved spec, using semantic headings, prose under 75 characters per line, tokenized colors, and imported formula constants. Add a reserved set to `deriveHandle` before uniqueness resolution.

- [ ] **Step 6: Verify GREEN**

Run: `pnpm vitest run tests/manual-report.test.ts tests/manual-report-components.test.tsx tests/methodology.test.tsx tests/handle.test.ts && pnpm typecheck && pnpm build`

Expected: tests pass and `/methodology` appears in build routes.

- [ ] **Step 7: Commit**

```bash
git add src/components/ManualReportForm.tsx src/components/MethodologyContent.tsx src/app/methodology/page.tsx src/app/report src/lib/manual-report.ts src/lib/handle.ts tests/manual-report.test.ts tests/manual-report-components.test.tsx tests/methodology.test.tsx tests/handle.test.ts
git commit -m "feat: restore reporting and methodology flows"
```

---

### Task 6: Build the Canonical AI Maxxing Card and Share Actions

**Files:**
- Create: `src/components/ProfileCardImage.tsx`
- Create: `src/components/ProfileShareActions.tsx`
- Create: `src/lib/share-intent.ts`
- Create: `src/app/api/v1/profile/[handle]/card/route.tsx`
- Create: `src/app/api/v1/me/card/route.tsx`
- Create: `tests/profile-card-image.test.tsx`
- Create: `tests/profile-share-actions.test.tsx`
- Modify: `src/lib/share-card.ts`
- Modify: `tests/share-card.test.ts`
- Modify: `src/app/[handle]/opengraph-image.tsx`
- Modify: `src/app/[handle]/page.tsx`

**Interfaces:**
- Consumes: `ProfileRecord`, Index/currency/token formatters, authenticated owner handle
- Produces: `ShareCardData`, `ProfileCardImage`, `buildXShareUrl`, public/private PNG responses, share controls

- [ ] **Step 1: Write failing card-data tests**

Extend fixtures with multiple tools, models, token types, and projects. Assert:

```ts
expect(card).toMatchObject({
  handle: '@builder',
  index: '14.0',
  spend: '$125.50',
  tokens: '42.8M',
  tools: ['claude-code', 'codex-cli'],
  models: ['claude-opus-4-1', 'gpt-5'],
  projectLabel: '3 live projects',
})
```

Assert empty usage says `usage not connected`, and no fixed percentile/progress value exists.

- [ ] **Step 2: Write failing intent and component tests**

Assert the X intent has encoded text and canonical `https://www.aimaxxing.lol/@builder`; the image includes visible tool names, token/spend/project values, and canonical domain; private share controls disable X/copy while retaining download.

- [ ] **Step 3: Verify RED**

Run: `pnpm vitest run tests/share-card.test.ts tests/profile-card-image.test.tsx tests/profile-share-actions.test.tsx`

Expected: FAIL because extended data, image component, and share controls are missing.

- [ ] **Step 4: Implement one formatter and one image view**

Keep all calculations in `buildShareCardData(profile)`. `ProfileCardImage` accepts only formatted data and returns the ImageResponse-compatible JSX. Remove the decorative 72% rail and the obsolete `AIMAXXING.VERCEL.APP` label.

- [ ] **Step 5: Implement public and owner PNG routes**

The public route loads `getPublicProfile`; the owner route uses `auth()` plus `getProfileForViewer` and requires `isOwner`. Both return 1200 by 630 PNGs. The public route adds:

```ts
'Content-Disposition': `attachment; filename="aimaxxing-${safeHandle}.png"`
```

The Open Graph route reuses `ProfileCardImage` without download disposition.

- [ ] **Step 6: Implement share actions and profile preview**

`ProfileShareActions` is a client component. Use `navigator.share` when available only for an explicit generic Share button, X web intent for Share on X, Clipboard API for Copy link, and an `aria-live="polite"` status. Render the actual card preview as an image with descriptive alt text.

- [ ] **Step 7: Verify GREEN**

Run: `pnpm vitest run tests/share-card.test.ts tests/profile-card-image.test.tsx tests/profile-share-actions.test.tsx tests/queries.test.ts && pnpm typecheck && pnpm build`

Expected: all pass and both card API routes appear.

- [ ] **Step 8: Commit**

```bash
git add src/components/ProfileCardImage.tsx src/components/ProfileShareActions.tsx src/lib/share-card.ts src/lib/share-intent.ts src/app/'[handle]' src/app/api/v1/profile/'[handle]'/card src/app/api/v1/me/card tests/share-card.test.ts tests/profile-card-image.test.tsx tests/profile-share-actions.test.tsx
git commit -m "feat: make AI Maxxing cards shareable"
```

---

### Task 7: Fix Aggregate Performance, Accessibility, and Runtime Warnings

**Files:**
- Create: `src/lib/database-url.ts`
- Create: `tests/database-url.test.ts`
- Modify: `src/db/client.ts`
- Modify: `src/lib/queries.ts`
- Modify: `src/app/api/v1/collective/route.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/components/Board.tsx`
- Modify: `src/components/CollectiveCounter.tsx`
- Modify: `src/components/PortfolioManager.tsx`
- Modify: `src/components/SocialSettings.tsx`
- Modify: `tests/queries.test.ts`

**Interfaces:**
- Consumes: Postgres URL, collective/entrant query data, current UI tokens
- Produces: `normalizeDatabaseUrl`, aggregate collective query, WCAG-compliant controls

- [ ] **Step 1: Write failing database URL tests**

Assert `sslmode=require` becomes `sslmode=verify-full`, existing `verify-full` remains unchanged, unrelated parameters survive, and `pglite://` remains untouched.

- [ ] **Step 2: Write failing aggregate query parity tests**

Seed sponsored, verified, manual, private, public-empty, and public-with-data accounts. Assert a new `getCollectiveSummary` returns the same totals/model shares as current helpers and counts only actual entrants as developers.

- [ ] **Step 3: Verify RED**

Run: `pnpm vitest run tests/database-url.test.ts tests/queries.test.ts`

Expected: FAIL because URL normalization and aggregate summary do not exist.

- [ ] **Step 4: Implement URL normalization and SQL aggregation**

Normalize before `new Pool`. Use Drizzle aggregate expressions for all-time totals, daily totals, grouped verified model spend, and distinct public entrant count. Update homepage and collective API to consume the summary without loading complete tables.

- [ ] **Step 5: Apply accessibility and responsive fixes**

Set `--primary-foreground` to the tested dark neutral. Add global focus-visible outline tokens, `min-height: 44px` to action classes/components, reduced-motion overrides, narrow header/board layouts, labeled status regions, and text alternatives for verification. Replace `outline-none focus:border-primary` with visible focus rings. Keep OG inline colors because ImageResponse does not resolve CSS variables.

- [ ] **Step 6: Verify GREEN and run static checks**

Run: `pnpm vitest run tests/database-url.test.ts tests/queries.test.ts tests/header.test.tsx tests/account-dashboard.test.tsx tests/portfolio-components.test.tsx tests/social-components.test.tsx && pnpm typecheck && pnpm build`

Expected: all pass and no pg SSL warning appears during a local production request using the normalized URL.

- [ ] **Step 7: Commit**

```bash
git add src/lib/database-url.ts src/db/client.ts src/lib/queries.ts src/app/api/v1/collective/route.ts src/app/page.tsx src/app/globals.css src/components tests/database-url.test.ts tests/queries.test.ts
git commit -m "fix: harden production product surfaces"
```

---

### Task 8: Verify, Push Main, Deploy, and Smoke Test

**Files:**
- Modify only files required by discovered verification failures

**Interfaces:**
- Consumes: completed web-repair implementation
- Produces: verified `main` commit and Ready production deployment

- [ ] **Step 1: Run the full local verification suite**

Run sequentially:

```bash
pnpm test
pnpm typecheck
pnpm build
git diff --check
git status --short --branch
```

Expected: 0 test failures, typecheck exit 0, build exit 0, no whitespace errors, and only intended changes.

- [ ] **Step 2: Run local route checks**

Start the production server and verify `/`, `/signin`, `/methodology`, anonymous `/settings`, private owner profile with a test session, public profile, public JSON, public card, and owner card. Verify 320, 768, and 1440 CSS pixel layouts through the available browser surface. If no browser is connected, use HTTP route checks and report the visual verification limitation explicitly.

- [ ] **Step 3: Commit any final verified corrections**

```bash
git add -A
git commit -m "fix: complete AI Maxxing activation flow"
```

Skip this commit if the worktree is already clean.

- [ ] **Step 4: Push main and deploy production**

```bash
git push origin main
pnpm dlx vercel@latest deploy --prod --yes --scope aivsomkars-projects
```

Require Vercel `readyState: READY` and alias `https://www.aimaxxing.lol`.

- [ ] **Step 5: Verify production**

Confirm:

- `/`, `/signin`, and `/methodology` return 200;
- anonymous `/settings` redirects to `/signin`;
- OAuth initiation redirects to GitHub with a non-empty client ID and canonical callback;
- the authenticated account lands on Settings;
- the private owner preview renders;
- GitHub sync writes or exposes a retry state;
- selected GitHub projects alone can produce a publishable profile;
- public profile, JSON, Open Graph, download card, X intent, and copy link agree;
- production logs contain no new Auth.js configuration errors, database SSL warnings, leaked tokens, or raw payloads.

- [ ] **Step 6: Record production evidence**

Report deployment URL, commit SHA, test counts, route statuses, OAuth redirect assertion, profile/card assertions, and any limitation that still requires the user’s signed-in browser.
