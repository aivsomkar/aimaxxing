# AI Portfolio Profiles — Design Specification

**Date:** 2026-08-22

**Status:** Approved direction; ready for implementation planning

## Goal

Turn each public AI Maxxing profile into a lightweight AI portfolio: the existing account-level
Index, spend, tokens, tools, and model usage remain the proof of practice, while a curated “Built”
section links to the live websites the developer has shipped.

The portfolio is deliberately shallow. It is a showcase of live work, not a project-management,
deployment-monitoring, or per-project AI analytics product.

## Product decisions

- AI usage remains account-level. No tokens, models, costs, prompts, repositories, or sessions are
  attributed to an individual project.
- A project is public only after the user explicitly selects or manually adds it.
- GitHub and Vercel imports create private suggestions. They never auto-publish.
- Imports are snapshots. AI Maxxing does not continuously sync external accounts in v1.
- The public profile shows a project count and a compact grid of live website links.
- The profile share card includes the live-project count alongside the existing Index, spend, and
  tool count.
- Manual entry supports sites hosted anywhere, including providers other than Vercel.

## Scope

### In scope

- Import public GitHub repositories that have a valid `homepage` URL.
- Import production Vercel projects through a read-only Vercel integration.
- Add, edit, reorder, and remove manual or imported portfolio entries.
- Select imported suggestions before they become public.
- Render selected projects on the existing public profile.
- Include the selected project count on the generated profile share card.
- Delete portfolio entries when the user invokes “Delete everything.”

### Out of scope

- Per-project token, model, tool, cost, or session attribution.
- Continuous synchronization, webhooks, deployment status, uptime, or analytics.
- Website screenshots, Open Graph scraping, or arbitrary page crawling.
- Importing private GitHub repositories in v1.
- Editing a repository or deployment in GitHub or Vercel.
- Likes, comments, case studies, collaborators, or project categories.

## User flow

### Portfolio settings

Authenticated users open `/settings/portfolio` and see:

1. Their published projects, with edit, reorder, and remove controls.
2. “Import from GitHub,” which fetches public owned repositories with a live homepage.
3. “Connect Vercel,” which starts the Vercel integration install flow.
4. “Add another website,” a manual form for anything hosted elsewhere.

GitHub and Vercel results appear as private candidate rows with checkboxes. “Add selected” copies
only the checked candidates into the published portfolio table. Unselected candidates remain
private and expire.

### Public profile

Below the account-level Index breakdown, the profile renders:

- `BUILT · N LIVE PROJECTS` as the section label and count.
- A responsive two-column grid on larger screens and one column on mobile.
- Each card contains the project title, live hostname, optional short description, source badge,
  and an external-link affordance.
- Clicking anywhere on a card opens the live website in a new tab with safe external-link
  attributes.
- An empty portfolio renders no public section; it does not show an empty-state prompt to visitors.

The visual language stays inside the existing arena system: ink/bone surfaces, orange scoring
accent, mono utility labels, hairline score rails, and restrained card radii. The memorable element
is the transition from quantified practice (“Index”) to shipped proof (“Built”), not decorative
artwork.

### Share card

The 1200×630 profile image uses the existing dark arena palette. It shows:

- Handle and verification state.
- Large Index numeral.
- Tool count, total account spend, and live-project count on a score rail.
- `aimaxxing.lol` wordmark.

Missing or non-public profiles return not found rather than generating a zero-value card for an
arbitrary handle.

## Data model

### `users` addition

Add nullable `github_login`. The GitHub sign-in callback records the current login for new users
and refreshes it for returning users. Public profile handles remain stable and are never derived
again when the GitHub login changes.

### `portfolio_projects`

| Column | Type | Rule |
| --- | --- | --- |
| `id` | serial integer | Primary key |
| `user_id` | integer | References `users.id`, cascade delete |
| `source` | text | `github`, `vercel`, or `manual` |
| `external_id` | text nullable | GitHub repository ID or Vercel project ID |
| `title` | text | Trimmed, 1–80 characters |
| `description` | text nullable | Trimmed, maximum 180 characters |
| `live_url` | text | Normalized absolute HTTPS/HTTP URL |
| `repository_url` | text nullable | Normalized GitHub URL when available |
| `sort_order` | integer | Non-negative, controlled by owner |
| `created_at` | timestamp | Default now |
| `updated_at` | timestamp | Default now, refreshed on edit |

Constraints:

- Unique `(user_id, live_url)` prevents the same website appearing twice.
- Unique `(user_id, source, external_id)` prevents duplicate imported records when
  `external_id` is non-null.
- Source is validated at the application boundary and constrained in the database.

### `portfolio_import_sessions`

| Column | Type | Rule |
| --- | --- | --- |
| `id` | UUID | Primary key and opaque browser identifier |
| `user_id` | integer | References `users.id`, cascade delete |
| `source` | text | `github` or `vercel` |
| `state_hash` | text nullable | SHA-256 hash for Vercel callback CSRF validation |
| `candidates` | JSONB | Sanitized candidate array; no provider tokens |
| `expires_at` | timestamp | 30 minutes after creation |
| `created_at` | timestamp | Default now |

Import sessions are private, owner-scoped, single-use, and deleted after selection. Expired rows
are ignored and may be pruned opportunistically.

## Domain interfaces

### URL and entry validation

`src/lib/portfolio.ts` owns pure validation and mapping:

```ts
type PortfolioSource = 'github' | 'vercel' | 'manual'

type PortfolioCandidate = {
  externalId: string
  source: Exclude<PortfolioSource, 'manual'>
  title: string
  description: string | null
  liveUrl: string
  repositoryUrl: string | null
}

normalizeLiveUrl(input: string): string | null
normalizeRepositoryUrl(input: string): string | null
githubRepoToCandidate(repo: GitHubRepo): PortfolioCandidate | null
vercelProjectToCandidate(project: VercelProject): PortfolioCandidate | null
```

URL normalization accepts only `http:` and `https:`, strips fragments, lowercases the hostname,
and removes a trailing root slash. It rejects credentials, non-web protocols, localhost, and empty
hostnames. Candidate mappers reject archived/forked GitHub repositories, missing live URLs, and
Vercel projects without a production alias or domain.

### Portfolio mutations

`src/lib/portfolio-store.ts` owns database mutations behind an explicit user ID:

```ts
listPortfolioProjects(db, userId)
addManualProject(db, userId, input)
publishSelectedCandidates(db, userId, importSessionId, candidateIds)
updatePortfolioProject(db, userId, projectId, input)
removePortfolioProject(db, userId, projectId)
reorderPortfolioProjects(db, userId, orderedProjectIds)
```

Every mutation includes `user_id` in its predicate. Selection validates the import-session owner,
expiry, and candidate IDs in one transaction, upserts projects, then deletes the session.

### Public query

`getProfile(handle)` adds a narrow `projects` projection containing only:

```ts
{ id, source, title, description, liveUrl, repositoryUrl, sortOrder }
```

It never exposes external IDs, import sessions, GitHub IDs, provider tokens, or connection data.
The existing `canAppearOnBoards` gate still controls whether the profile is public.

## Import architecture

### GitHub

The app records `profile.login` during GitHub sign-in. The import action calls GitHub’s public
`GET /users/{username}/repos` endpoint with `type=owner`, `sort=updated`, and pagination up to 100
repositories. Authentication is not required for public repository metadata.

Candidates require:

- Repository owned by the user, not a fork, not archived or disabled.
- A valid `homepage` URL.
- Repository ID, name, description, homepage, and `html_url` only.

The importer stores sanitized candidates in a short-lived import session. GitHub rate-limit or
network failures leave existing portfolio projects unchanged and show a retryable error.

Reference: https://docs.github.com/en/rest/repos/repos#list-repositories-for-a-user

### Vercel

AI Maxxing uses a connectable Vercel integration with read-only `project`, `deployment`, and
`domain` access. The deployment requires `VERCEL_INTEGRATION_ID`,
`VERCEL_INTEGRATION_CLIENT_SECRET`, and `VERCEL_INTEGRATION_SLUG`.

Flow:

1. Create an owner-bound import session with a random state value and store only its SHA-256 hash.
2. Redirect to the Vercel integration install URL with the state and callback URL.
3. On callback, verify state, exchange the one-time code for an access token, and use that token to
   list projects and their production aliases/domains in the granted account or team.
4. Map valid projects to sanitized candidates and store them in the import session.
5. Discard the access token immediately; never write it to the database, logs, client response, or
   analytics.
6. Redirect back to `/settings/portfolio?import=<session-id>` for selection.

If a Vercel account has multiple teams, each installation imports the scope the user granted.
Repeating “Connect Vercel” creates a new snapshot.

Reference: https://vercel.com/docs/integrations/create-integration/vercel-api-integrations

## Routes and components

- `src/app/settings/portfolio/page.tsx`: authenticated portfolio management page.
- `src/app/settings/portfolio/actions.ts`: owner-scoped manual, selection, edit, delete, and reorder
  server actions.
- `src/app/api/integrations/vercel/start/route.ts`: starts a Vercel import.
- `src/app/api/integrations/vercel/callback/route.ts`: validates callback and creates candidates.
- `src/components/PortfolioGrid.tsx`: public project grid.
- `src/components/PortfolioManager.tsx`: settings list and forms; client code only where selection
  or reorder interaction requires it.
- `src/app/[handle]/opengraph-image.tsx`: generated share card.
- `src/lib/share-card.ts`: pure share-card view-model derivation.

The existing Settings page gains one concise “Portfolio” section with the published count and a
link to `/settings/portfolio`; the full importer UI does not inflate the account/privacy page.

## Error handling

- Invalid manual input returns field-level errors and writes nothing.
- Duplicate URLs update the existing owner record rather than rendering duplicates.
- Missing GitHub login asks the user to sign out and sign in again so it can be refreshed.
- External API failures are retryable and never remove already-published projects.
- Missing Vercel integration configuration renders “Vercel import is not configured” to the user
  and logs no secrets.
- Canceled Vercel consent returns to settings with a neutral canceled state.
- Invalid, expired, replayed, or wrong-owner import sessions return not found.
- Invalid external rows are skipped; the UI reports how many candidates were omitted.

## Security and privacy

- Imported candidates are private until selection.
- Provider access tokens never reach client JavaScript.
- The Vercel token is memory-only for the callback request and discarded after candidate creation.
- Vercel state is random, one-time, hashed at rest, owner-bound, and expires after 30 minutes.
- Server actions derive the current user from Auth.js and pass only the internal user ID to domain
  mutations.
- External links use `target="_blank"` and `rel="noreferrer noopener"`.
- “Delete everything” removes projects and import sessions in the same transaction as usage data.

## Testing strategy

Implementation follows red-green-refactor.

1. Pure tests for URL normalization, GitHub mapping, Vercel mapping, and share-card data.
2. Database integration tests for owner isolation, manual CRUD, duplicate upsert, candidate
   selection, expiry, single-use sessions, reorder, and delete-everything cleanup.
3. Route tests around Vercel state validation and code-exchange failure with the network boundary
   injected; tests assert persisted candidates, not mock call counts.
4. Query tests prove public profiles expose selected project fields and never expose import or
   provider identifiers.
5. Full test suite, schema drift guard, typecheck, and production build.
6. Live smoke test after deployment: public profile HTML, Open Graph image content type, manual
   website flow, GitHub candidate import, and Vercel callback when credentials are configured.

## Operational requirements

- Create the Vercel integration in the Vercel dashboard with the production callback URL.
- Add its ID, secret, and slug to Vercel as sensitive production/preview variables.
- Add the same variable names without values to `.env.example`.
- Apply the generated database migration to Neon before deploying application code that queries
  the new tables.
- Existing users refresh `github_login` on their next successful GitHub sign-in.

## Success criteria

- A signed-in user can import GitHub candidates, select two, and see only those two publicly.
- A signed-in user can connect Vercel, select production projects, and publish them without any
  Vercel token being persisted.
- A user can manually add a valid live website from any host.
- A user cannot read or mutate another user’s projects or import session.
- The profile project count, project grid, and share-card count agree.
- Account-level AI usage remains unchanged and no per-project usage fields exist.
- Deleting all data removes portfolio records and public project links.
