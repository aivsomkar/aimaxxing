# AI Maxxing Product Repair and Share Card Design

**Date:** 2026-08-22
**Status:** Approved in chat on 2026-08-22
**Product context:** `PRODUCT.md`
**Visual system:** `DESIGN.md`

## 1. Goal

Repair the signed-in product so a developer can authenticate, understand their account state, import selected live websites, receive GitHub output statistics, preview a private profile, publish intentionally, and share a reproducible AI Maxxing card.

This work restores the activation loop promised by the original product specification. It does not make GitHub sign-in pretend to contain local AI-tool usage. Verified Claude Code, Codex CLI, and OpenCode usage arrives through the separate reporter design in `2026-08-22-verified-reporter-design.md`.

## 2. Confirmed Product Decisions

- AI Maxxing is primarily a developer product with brand-led public surfaces.
- The personality is competitive, transparent, and credible.
- Public profiles require explicit opt-in.
- The owner can always see a private preview of their own profile.
- GitHub and provider imports remain private until the owner selects entries.
- The AI Maxxing card is the main share loop, not a decorative extra.
- All repaired surfaces target WCAG 2.2 AA and respect reduced motion.

## 3. Evidence and Root Causes

The production audit found one successfully created GitHub account and no product data:

| Record | Production count |
| --- | ---: |
| Users | 1 |
| Usage rows | 0 |
| GitHub-stat rows | 0 |
| Published projects | 0 |
| Public users | 0 |

The account was created as `@aivsomkar`, proving OAuth and account provisioning worked. The visible failure came from disconnected product behavior:

1. Auth.js returned a direct sign-in to the anonymous homepage.
2. The static header had no authenticated state, dashboard link, profile link, or sign-out action.
3. The public profile query returned `null` for every private or usage-free owner.
4. No owner-only profile reader existed.
5. GitHub OAuth never synchronized `github_stats`.
6. The approved `/methodology` route was never implemented, so the header linked to a 404.
7. The specified local reporter was deferred, so no automatic token or model data could exist.
8. GitHub portfolio discovery already finds ten live sites for the account, but the product never leads the user to the selection flow.

## 4. User Journey

### 4.1 Signed out

- The header shows Leaderboard, Methodology, and Sign in.
- Sign in uses GitHub and returns to `/settings`.
- Protected URLs preserve their intended callback when authentication is required.

### 4.2 First sign-in

- The account is created or refreshed.
- A best-effort GitHub output sync runs with the OAuth access token. The token is never persisted.
- The user lands on the account dashboard.
- The dashboard shows the stable handle, privacy state, data status, and next actions.

### 4.3 Account dashboard

The dashboard is organized around four ordered actions:

1. **GitHub connected.** Show GitHub login, last output sync, merged PR count, contribution count, and a retry action when sync failed.
2. **Show live work.** Link to the existing portfolio selector. GitHub candidates remain private until selected.
3. **Connect AI usage.** Explain that local usage cannot come from GitHub. Show reporter connection status and the exact `npx aimaxxing link` command once the reporter sub-project ships. Until then, manual entry remains available and is labeled self-reported.
4. **Publish and share.** Show private preview first. Publishing remains a separate explicit action.

The page never renders simultaneous “publish” and “remove” actions. It renders the action that matches the current state.

### 4.4 Private preview and public profile

- `/@handle` is owner-aware.
- The signed-in owner can view the route before publication and before data exists.
- A private banner explains that only the owner can see the preview.
- Anonymous visitors and other users receive 404 until publication requirements are met.
- A public profile qualifies when `publicOptIn` is true and at least one showcase signal exists: a usage row, a selected project, or a non-zero GitHub output row.
- Leaderboards continue to require usage rows. A project-only profile never creates an empty leaderboard entry.
- Empty usage, project, and output sections teach the owner the next action instead of claiming “verified” or showing a misleading zero table.

## 5. Profile Data Boundary

Split the current consent-gated `getProfile` behavior into two explicit layers:

```ts
type ProfileRecord = {
  user: PublicUser
  xHandle: string | null
  tools: ToolDepth[]
  models: { model: string; tokens: number; costUsd: number }[]
  tokenTotals: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
    total: number
  }
  costUsd: number
  mergedPrs: number
  activeRepos: number
  contributions: number
  anyUnverified: boolean
  projects: PublicPortfolioProject[]
}

getProfileRecord(handle: string): Promise<ProfileRecord | null>
getPublicProfile(handle: string): Promise<ProfileRecord | null>
getProfileForViewer(handle: string, viewerHandle: string | null): Promise<{
  profile: ProfileRecord
  isOwner: boolean
  isPublic: boolean
} | null>
```

`getProfileRecord` reads only fields safe for profile rendering. It never returns GitHub IDs, OAuth tokens, reporter keys, import sessions, provider credentials, or private social fields. `getPublicProfile` applies publication consent and showcase-content requirements. `getProfileForViewer` permits the matching owner to bypass only the publication gate.

The public JSON API and public Open Graph route call `getPublicProfile`. They never use the owner bypass.

## 6. GitHub Output Synchronization

The OAuth `signIn` callback receives the provider account and its temporary access token. Account provisioning and output synchronization are separated so an upstream GitHub failure cannot block authentication.

```ts
provisionGitHubAccount(identity): Promise<User>
fetchGitHubOutput(accessToken, login, now?): Promise<GitHubOutput>
upsertGitHubOutput(userId, output): Promise<void>
```

The GitHub adapter performs one authenticated GraphQL request:

- merged pull requests authored by the current login;
- contribution-calendar total for the previous year, including restricted contribution count when GitHub exposes it to the owner;
- owned repositories and their activity timestamps, from which active non-archived repositories are counted using a fixed 90-day window.

The adapter validates the response before persistence. Errors are logged with a stable event name and no token. Existing statistics remain unchanged on failure. The dashboard exposes “not synced” or the last successful `syncedAt` value and offers a retry action.

## 7. AI Maxxing Card

### 7.1 Card contents

The canonical 1200 by 630 card contains:

- `@handle` and visible X username;
- AI Maxxing Index;
- verification state: verified, mixed, self-reported, or usage not connected;
- up to three leading tool names;
- up to three leading model names when model data exists;
- total tokens in compact notation;
- total account spend;
- selected live-project count;
- up to three selected project titles;
- canonical `aimaxxing.lol/@handle` identity.

No percentile, rank, progress bar percentage, or “top N%” appears unless it is computed from current production ranking data. The existing decorative fixed-width 72% rail is removed.

### 7.2 Single source of truth

`buildShareCardData(profile)` remains the only formatter for card values. It calls the same Index and currency helpers as the profile and adds token, model, tool, and project summaries. The card component consumes formatted card data and has no independent calculations.

The same card component is used by:

- the public Open Graph image for link unfurls;
- the authenticated private preview;
- the public PNG download response;
- the profile-page card preview.

### 7.3 Share actions

Published profiles render:

- **Share on X**, using a web intent containing a concise generated sentence and the canonical profile URL;
- **Copy profile link**, using the Clipboard API with an accessible success status and a plain-link fallback;
- **Download card**, returning the canonical PNG with `Content-Disposition: attachment` and a safe filename such as `aimaxxing-aivsomkar.png`.

Private owners can preview and download their card because downloading is an explicit local action. Copy-link and X-sharing actions remain disabled until publication because the public URL would otherwise return 404.

## 8. Routes and Components

### New routes

- `/signin`: branded GitHub sign-in page with a server action that redirects to `/settings`.
- `/methodology`: formula, verification, privacy, sponsorship neutrality, and reporter behavior.
- `/api/v1/profile/[handle]/card`: public downloadable PNG for published profiles.
- `/api/v1/me/card`: authenticated owner preview PNG.

### Changed surfaces

- `Header`: server-rendered authenticated and anonymous navigation states.
- `/settings`: account dashboard and activation checklist.
- `/settings/portfolio`: unchanged selection semantics, with clearer return-to-dashboard state.
- `/report`: useful success and validation feedback, token fields for self-reported data, and a return-to-dashboard action.
- `/@handle`: private owner preview, honest empty states, card preview, and share actions.
- `/`: signed-in activation notice when the account is incomplete, without replacing the public arena.

Reserved product routes such as `methodology`, `settings`, `report`, `signin`, `sponsor`, and `api` are excluded from generated public handles.

## 9. Methodology

The methodology page imports formula constants from `index-math.ts` so documentation cannot drift from calculation. It covers:

- the exact Index formula and qualification floor;
- why spend is displayed but excluded from the Index;
- the additive capped GitHub output term;
- verified versus self-reported data;
- the distinction between GitHub data and local AI usage;
- the aggregates-only reporter privacy contract;
- explicit public publication;
- sponsor neutrality and exclusion of sponsored credits.

## 10. Accessibility and Responsive Repair

- Change `--primary-foreground` to a tinted dark neutral that reaches at least 4.5:1 on the ember primary background.
- Add consistent `:focus-visible` treatment for links, buttons, summaries, checkboxes, and inputs.
- Preserve focus when server actions complete or report an error.
- Make primary tap targets at least 44 by 44 CSS pixels.
- Give destructive deletion a confirmation step and clear irreversible copy.
- Keep status meaning in text, not emoji or color alone.
- Collapse or wrap authenticated navigation without horizontal overflow at 320 CSS pixels.
- Reformat leaderboard rows and profile calculations for narrow screens without hiding data.
- Disable non-essential transforms and continuous interpolation under `prefers-reduced-motion: reduce`.

## 11. Performance and Operational Repair

- Replace homepage full-table materialization with database aggregate queries for totals and grouped model shares.
- Count public developers from actual all-time entrants, not every opted-in account.
- Keep the 15-second poll but return pre-aggregated values from the server.
- Normalize legacy `sslmode=require` database URLs to `sslmode=verify-full` before pool creation, preserving current verification behavior while removing the runtime warning.
- Add stable server error events for GitHub sync, report ingestion, and card rendering without user secrets or payload content.

## 12. Error Handling

- GitHub sync failure never blocks sign-in.
- Import and sync errors produce actionable dashboard messages.
- Manual report validation returns field-level errors rather than an unhandled server-action page.
- Card rendering returns 404 for unpublished public requests and 401 for unauthenticated owner requests.
- Share controls report copied, blocked, and failed states through an `aria-live` status.
- Publication fails with an explanatory message when the profile has no showcase signal.

## 13. Testing and Acceptance

Automated tests must prove:

- account provisioning and GitHub synchronization are independent;
- GitHub output mapping, validation, and upsert behavior;
- owner preview works for a private empty account;
- public requests stay hidden before opt-in;
- a selected-project-only account can publish a profile but never appears on usage boards;
- card values match profile and JSON values;
- private and public card routes enforce their distinct access rules;
- share links contain the canonical production profile URL;
- methodology constants match `index-math.ts`;
- reserved handles are never assigned;
- manual report validation and success behavior;
- aggregate queries preserve current collective and ranking results;
- all interactive components expose labels and visible focus classes.

Production acceptance requires:

1. GitHub sign-in lands on `/settings`.
2. `@aivsomkar` appears as a private owner preview.
3. GitHub output sync produces a `github_stats` row or a visible retry state.
4. GitHub portfolio import presents the ten currently discoverable live-site candidates and publishes only selected rows.
5. Publishing makes `/@aivsomkar`, its JSON, Open Graph image, and downloadable card public.
6. X share, copy link, and card download work from the public profile.
7. `/methodology` returns 200 and contains the live formula constants.
8. Anonymous settings and owner-card requests remain protected.
9. Full tests, typecheck, production build, narrow-viewport checks, and live route smoke tests pass.

## 14. Scope Boundaries

This repair does not add billing, teams, comments, notifications, rank history, or Vercel importing. Vercel remains visibly unavailable. Verified local telemetry is delivered by the reporter sub-project, not fabricated from GitHub data or browser state.
