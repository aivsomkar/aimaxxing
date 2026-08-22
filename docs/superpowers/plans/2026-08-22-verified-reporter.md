# Verified Reporter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a privacy-preserving `aimaxxing` npm reporter that scans Claude Code, Codex CLI, and OpenCode locally and sends verified, signed daily aggregates to the linked account.

**Architecture:** Add a dependency-light ESM CLI workspace package with pure source adapters, local Ed25519 identity, and an explicit scan-confirm-link-sync flow. The web app implements one-time device linking and signature-verified snapshot ingestion; reporter ownership makes repeated syncs idempotent and revocation scoped.

**Tech Stack:** Node.js 22+, TypeScript 5.8, pnpm workspaces, Node crypto/fs/sqlite, Zod 3, Next.js route handlers, Drizzle/Postgres/PGlite, Vitest 3

**Spec:** `docs/superpowers/specs/2026-08-22-verified-reporter-design.md`

## Global Constraints

- No prompt, response, code, reasoning, path, repository, command, title, attachment, or raw record may enter a network payload.
- A scan occurs and is displayed before the first network request.
- Transmission and public publication remain separate explicit choices.
- Reporter rows are verified only after signature validation.
- Repeated snapshots are idempotent and scoped to one reporter.
- V1 supports explicit scan/sync only; it installs no daemon, hook, extension, or scheduled task.
- npm publishing requires a separate owner-authenticated release action.
- All work lands directly on `main`; do not create a branch.

---

### Task 1: Create the Reporter Workspace and Canonical Types

**Files:**
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json`
- Create: `packages/reporter/package.json`
- Create: `packages/reporter/tsconfig.json`
- Create: `packages/reporter/src/adapters/types.ts`
- Create: `packages/reporter/src/report.ts`
- Create: `packages/reporter/tests/report.test.ts`

**Interfaces:**
- Consumes: Node 22+, root Vitest tooling
- Produces: `UsageAggregate`, `ScanResult`, `UsageAdapter`, `mergeAggregates`, `serializeReportRows`

- [ ] **Step 1: Write failing aggregate tests**

Assert rows merge by tool/model/day, session IDs deduplicate before counts, numeric values reject negatives/non-finite/unsafe integers, ordering is deterministic, and serialization contains exactly the approved aggregate keys.

```ts
expect(Object.keys(serializeReportRows(rows)[0]).sort()).toEqual([
  'cacheRead', 'cacheWrite', 'costUsd', 'day', 'model',
  'sessions', 'tokensIn', 'tokensOut', 'tool',
])
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm vitest run packages/reporter/tests/report.test.ts`

Expected: FAIL because the reporter package does not exist.

- [ ] **Step 3: Add workspace and package configuration**

Add `packages: ['packages/*']` while retaining existing `allowBuilds`. Configure package name `aimaxxing`, `private: false`, `type: module`, `bin: { aimaxxing: './dist/cli.js' }`, Node engine `>=22`, build/typecheck/test/pack scripts, and `files: ['dist', 'README.md']`. Use `tsc` output to `dist` with declaration files and no DOM dependency.

- [ ] **Step 4: Implement canonical types and merge logic**

Represent adapter observations internally with `sessionId` and convert to public `UsageAggregate` only after deduplication. Freeze the outbound key allowlist in `serializeReportRows`; never spread source objects.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm vitest run packages/reporter/tests/report.test.ts && pnpm --filter aimaxxing typecheck`

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add pnpm-workspace.yaml package.json packages/reporter
git commit -m "feat: scaffold verified usage reporter"
```

---

### Task 2: Parse Claude Code and Codex CLI Logs Safely

**Files:**
- Create: `packages/reporter/src/adapters/jsonl.ts`
- Create: `packages/reporter/src/adapters/claude-code.ts`
- Create: `packages/reporter/src/adapters/codex-cli.ts`
- Create: `packages/reporter/tests/claude-code.test.ts`
- Create: `packages/reporter/tests/codex-cli.test.ts`
- Create: `packages/reporter/tests/fixtures/claude-code/*.jsonl`
- Create: `packages/reporter/tests/fixtures/codex-cli/*.jsonl`

**Interfaces:**
- Consumes: local filesystem and synthetic JSONL fixtures
- Produces: `ClaudeCodeAdapter`, `CodexCliAdapter`, safe streaming JSONL utility

- [ ] **Step 1: Create synthetic fixtures and failing Claude tests**

Fixtures include repeated assistant message IDs, cache tokens, two models, invalid JSON, and forbidden content/path fields with sentinel strings. Assert correct daily totals and verify serialized output does not contain any sentinel.

- [ ] **Step 2: Create synthetic fixtures and failing Codex tests**

Fixtures include session metadata, repeated cumulative `payload.info.total_token_usage` snapshots, model changes, cached input, cache write, and forbidden tool/content fields. Assert the maximum cumulative snapshot per session is used rather than summing snapshots.

- [ ] **Step 3: Run and verify RED**

Run: `pnpm vitest run packages/reporter/tests/claude-code.test.ts packages/reporter/tests/codex-cli.test.ts`

Expected: FAIL because adapters are missing.

- [ ] **Step 4: Implement the streaming JSONL utility and Claude adapter**

Read line by line with `node:readline`. Parse only records with assistant usage. Copy named scalar fields into a fresh observation, deduplicate by `message.id + requestId` with a fallback stable hash of non-content identifiers, and count distinct session IDs.

- [ ] **Step 5: Implement the Codex adapter**

Track per-session model and the largest cumulative usage counters. Convert one final observation per session/day/model. Ignore any nested field outside the explicit metadata and token-key allowlists.

- [ ] **Step 6: Verify GREEN**

Run: `pnpm vitest run packages/reporter/tests/claude-code.test.ts packages/reporter/tests/codex-cli.test.ts packages/reporter/tests/report.test.ts && pnpm --filter aimaxxing typecheck`

Expected: all pass and sentinel privacy assertions remain green.

- [ ] **Step 7: Commit**

```bash
git add packages/reporter/src/adapters packages/reporter/tests
git commit -m "feat: scan Claude Code and Codex usage"
```

---

### Task 3: Add Versioned OpenCode Scanning and Pricing

**Files:**
- Create: `packages/reporter/src/adapters/opencode.ts`
- Create: `packages/reporter/src/pricing.ts`
- Create: `packages/reporter/src/pricing-data.json`
- Create: `packages/reporter/tests/opencode.test.ts`
- Create: `packages/reporter/tests/pricing.test.ts`
- Create: `packages/reporter/tests/fixtures/opencode/*`

**Interfaces:**
- Consumes: supported OpenCode storage fixture, canonical token observations
- Produces: `OpenCodeAdapter`, `estimateCost`, `PRICING_VERSION`

- [ ] **Step 1: Write the supported OpenCode SQLite contract into the fixture helper**

Create a temporary SQLite database with Node 22 `DatabaseSync` and a `session` table containing exactly `id`, `model`, `cost`, `tokens_input`, `tokens_output`, `tokens_reasoning`, `tokens_cache_read`, `tokens_cache_write`, and `time_created`. Insert two synthetic session rows with JSON model references and known totals. Add unrelated `directory`, `title`, and `message` data containing privacy sentinels to prove the adapter never selects them.

- [ ] **Step 2: Write failing OpenCode tests**

Assert supported fixtures map only session, timestamp, model, token counters, and explicit cost. Assert missing storage returns `not_found`, a database missing any required session column returns `unsupported_format`, and forbidden text fields never serialize.

- [ ] **Step 3: Write failing pricing tests**

Assert known model input/output/cache rates, explicit trusted source cost precedence, unknown-model zero cost plus `unknown_price`, deterministic rounding to four decimals, and a non-empty date-based `PRICING_VERSION`.

- [ ] **Step 4: Verify RED**

Run: `pnpm vitest run packages/reporter/tests/opencode.test.ts packages/reporter/tests/pricing.test.ts`

Expected: FAIL because adapter and pricing modules are absent.

- [ ] **Step 5: Implement versioned OpenCode reader and pricing**

Open the resolved `opencode.db` with `new DatabaseSync(path, { readOnly: true })`. Check `PRAGMA table_info(session)` against the required column set, then execute a literal SELECT naming only those columns. Parse `model` into `providerID/modelID`, map recorded counters and cost, and close the database in `finally`. Bundle a reviewed pricing snapshot containing only supported model IDs and token rates. Apply pricing after adapters normalize tokens so source parsers do not own price logic.

- [ ] **Step 6: Verify GREEN**

Run: `pnpm vitest run packages/reporter/tests/opencode.test.ts packages/reporter/tests/pricing.test.ts packages/reporter/tests/*.test.ts && pnpm --filter aimaxxing typecheck`

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add packages/reporter/src/adapters/opencode.ts packages/reporter/src/pricing.ts packages/reporter/src/pricing-data.json packages/reporter/tests
git commit -m "feat: scan OpenCode and estimate usage cost"
```

---

### Task 4: Add Reporter and Link-Session Data Models

**Files:**
- Modify: `src/db/schema.ts`
- Create: generated `drizzle/0002_*.sql`
- Modify: `tests/schema.test.ts`
- Modify: `tests/schema-drift.test.ts` only if the generated migration contract requires it
- Create: `src/lib/reporter-store.ts`
- Create: `tests/reporter-store.test.ts`

**Interfaces:**
- Consumes: users and manual tool-days tables
- Produces: reporter/link/submission schema and owner-scoped store functions

- [ ] **Step 1: Write failing schema tests**

Assert `reporters`, `reporterLinkSessions`, `reporterSubmissions`, `reporterActionRequests`, and `reporterToolDays` fields and indexes from the spec. Assert `reporterToolDays` has required reporter ownership, cascades with reporter deletion only after explicit confirmation, and is unique by reporter/tool/model/day. Assert action request IDs are unique per reporter and the existing manual `toolDays` uniqueness is unchanged.

- [ ] **Step 2: Write failing store tests**

Test hashed one-time device codes, ten-minute expiry, approval by one user, one-time consumption, reporter creation, revocation, reporter ownership, and submission-ID uniqueness.

- [ ] **Step 3: Verify RED**

Run: `pnpm vitest run tests/schema.test.ts tests/reporter-store.test.ts`

Expected: FAIL because tables and store are missing.

- [ ] **Step 4: Implement schema and generate migration**

Use Drizzle definitions with UUID reporter IDs, unique public-key fingerprints, indexed code hashes/expiry, unique submission IDs, replay-protected reporter action requests, and a separate `reporterToolDays` table. Generate with `pnpm db:generate`; inspect the SQL and reject any drop/truncate statement before applying locally.

- [ ] **Step 5: Implement reporter store**

Store SHA-256 hashes of device/user codes. Use constant-time byte comparison for code verification. All approve, consume, revoke, and delete operations require explicit user or reporter ownership parameters.

- [ ] **Step 6: Verify GREEN and migration parity**

Run: `pnpm db:migrate && pnpm vitest run tests/schema.test.ts tests/reporter-store.test.ts tests/schema-drift.test.ts && pnpm typecheck`

Expected: all pass and schema drift is zero.

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.ts src/lib/reporter-store.ts drizzle tests/schema.test.ts tests/reporter-store.test.ts tests/schema-drift.test.ts
git commit -m "feat: store linked usage reporters"
```

---

### Task 5: Implement Device Linking and Browser Approval

**Files:**
- Create: `src/lib/reporter-link.ts`
- Create: `src/app/api/v1/reporters/link/start/route.ts`
- Create: `src/app/api/v1/reporters/link/status/route.ts`
- Create: `src/app/link/page.tsx`
- Create: `src/app/link/actions.ts`
- Create: `src/components/ReporterApproval.tsx`
- Create: `tests/reporter-link.test.ts`
- Create: `tests/reporter-approval.test.tsx`

**Interfaces:**
- Consumes: reporter store, Auth.js owner session, public key and machine label
- Produces: start/status protocol, authenticated approve/deny page

- [ ] **Step 1: Write failing protocol tests**

Assert generated device codes have at least 256 bits of entropy, user codes are human-readable, raw codes are returned once and never stored, polling honors pending/approved/denied/expired states, and a consumed link cannot create another reporter.

- [ ] **Step 2: Write failing approval component tests**

Assert the page shows user code, machine label, public-key fingerprint, expiry, Approve, and Deny. It must not display raw device code or public key material.

- [ ] **Step 3: Verify RED**

Run: `pnpm vitest run tests/reporter-link.test.ts tests/reporter-approval.test.tsx`

Expected: FAIL because protocol and page are absent.

- [ ] **Step 4: Implement start/status routes**

Validate request sizes and labels with Zod. Return `{ deviceCode, userCode, verificationUrl, interval: 5, expiresIn: 600 }`. Hash codes before persistence. Status responses are limited to `pending`, `approved` with `{ reporterId, handle }`, `denied`, or `expired`.

- [ ] **Step 5: Implement browser approval**

Require Auth.js session. Look up by user-code hash, render the fingerprint, and bind only the current user on approval. Redirect anonymous users through `/signin` with the full `/link?code=...` callback.

- [ ] **Step 6: Verify GREEN**

Run: `pnpm vitest run tests/reporter-link.test.ts tests/reporter-approval.test.tsx tests/reporter-store.test.ts && pnpm typecheck && pnpm build`

Expected: all pass and link routes appear in the build.

- [ ] **Step 7: Commit**

```bash
git add src/lib/reporter-link.ts src/app/api/v1/reporters/link src/app/link src/components/ReporterApproval.tsx tests/reporter-link.test.ts tests/reporter-approval.test.tsx
git commit -m "feat: approve reporter devices in the browser"
```

---

### Task 6: Verify Signatures and Apply Idempotent Snapshots

**Files:**
- Create: `src/lib/reporter-crypto.ts`
- Create: `src/lib/reporter-ingest.ts`
- Create: `src/app/api/v1/reporters/report/route.ts`
- Create: `tests/reporter-crypto.test.ts`
- Create: `tests/reporter-ingest.test.ts`
- Modify: `src/lib/queries.ts`

**Interfaces:**
- Consumes: signed canonical report, active reporter public key, report schema
- Produces: `canonicalReportBytes`, `verifySignedReport`, `applyReporterSnapshot`

- [ ] **Step 1: Write failing cryptographic tests**

Generate fixture Ed25519 keys at test time. Assert canonical key ordering, valid signature acceptance, altered row rejection, invalid base64 rejection, five-minute skew enforcement, and revoked reporter rejection.

- [ ] **Step 2: Write failing snapshot tests**

Use two reporters and manual rows on one account. Assert first insert, same-submission replay rejection, new-snapshot replacement only for the submitting reporter, preservation of the other reporter/manual rows, verified reporter-table ownership, and rollback on any invalid row.

- [ ] **Step 3: Verify RED**

Run: `pnpm vitest run tests/reporter-crypto.test.ts tests/reporter-ingest.test.ts`

Expected: FAIL because verification and snapshot modules are absent.

- [ ] **Step 4: Implement canonical verification**

Canonicalize the unsigned fields in fixed order, UTF-8 encode, SHA-256 hash for submission records, and verify with `crypto.verify(null, bytes, publicKey, signature)`. Validate schema and caps before starting the database transaction.

- [ ] **Step 5: Implement snapshot transaction and route**

Upsert present `reporterToolDays` rows keyed by reporter/tool/model/day, delete absent rows for only that reporter, insert the unique submission record, and update last-seen atomically. Return `{ ok: true, rows, receivedAt }`; map failures to stable 400/401/409/413/429 responses.

- [ ] **Step 6: Update public aggregation**

Union manual `toolDays` and verified `reporterToolDays`, then aggregate by account/tool/model/day before computing profiles and boards. Preserve existing manual public results.

- [ ] **Step 7: Verify GREEN**

Run: `pnpm vitest run tests/reporter-crypto.test.ts tests/reporter-ingest.test.ts tests/queries.test.ts tests/ingest-db.test.ts && pnpm typecheck`

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/reporter-crypto.ts src/lib/reporter-ingest.ts src/app/api/v1/reporters/report/route.ts src/lib/queries.ts tests/reporter-crypto.test.ts tests/reporter-ingest.test.ts
git commit -m "feat: ingest signed reporter snapshots"
```

---

### Task 7: Implement CLI Crypto, Configuration, HTTP, and Commands

**Files:**
- Create: `packages/reporter/src/config.ts`
- Create: `packages/reporter/src/crypto.ts`
- Create: `packages/reporter/src/http.ts`
- Create: `packages/reporter/src/scan.ts`
- Create: `packages/reporter/src/cli.ts`
- Create: `packages/reporter/README.md`
- Create: `packages/reporter/tests/config.test.ts`
- Create: `packages/reporter/tests/crypto.test.ts`
- Create: `packages/reporter/tests/cli.test.ts`

**Interfaces:**
- Consumes: adapters, canonical rows, device endpoints, report endpoint
- Produces: `scan`, `link`, `sync`, `status`, `unlink` commands

- [ ] **Step 1: Write failing config and crypto tests**

Assert Ed25519 generation/signing, config file mode `0600` on POSIX, atomic write/rename, corrupt-config error, private-key redaction, and canonical bytes matching server fixtures.

- [ ] **Step 2: Write failing CLI behavior tests**

Inject filesystem, prompt, browser-open, clock, and fetch dependencies. Assert scan makes zero HTTP calls; declined link makes zero HTTP calls and writes nothing; link polls at server interval and stores the approved handle; sync signs deterministic rows; `--yes` skips only the transmission prompt; status redacts secrets; unlink signs a self-revocation request and uses two confirmations before requesting reporter-data deletion.

- [ ] **Step 3: Verify RED**

Run: `pnpm vitest run packages/reporter/tests/config.test.ts packages/reporter/tests/crypto.test.ts packages/reporter/tests/cli.test.ts`

Expected: FAIL because CLI modules are absent.

- [ ] **Step 4: Implement local configuration and signing**

Use platform config roots and store `{ reporterId, handle, machineId, privateKeyPem, publicKeyPem, apiBaseUrl, lastSyncAt }`. Write a redacted formatter that never exposes PEM values. Share canonicalization fixtures with the server through literal cross-package fixtures, not runtime web-app imports.

- [ ] **Step 5: Implement HTTP and command orchestration**

Use built-in `fetch`, bounded timeouts, JSON content limits, stable error messages, and the exact order scan, display, confirm, network. Print adapter warnings and aggregate totals before confirmation. Open the verification URL with platform commands only after the start response; always print the URL as fallback. Implement unlink by signing `{ reporterId, action: 'revoke', issuedAt, requestId, deleteData }`; the server accepts that signature only from the same active reporter. Settings uses the authenticated-owner path on the same endpoint.

- [ ] **Step 6: Document privacy and commands**

README must list transmitted and forbidden fields, supported paths/formats, manual sync behavior, revocation semantics, Node requirement, and the fact that unknown-model cost can be zero while tokens stay accurate.

- [ ] **Step 7: Verify GREEN and package**

Run: `pnpm vitest run packages/reporter/tests/*.test.ts && pnpm --filter aimaxxing typecheck && pnpm --filter aimaxxing build && pnpm --filter aimaxxing pack --pack-destination ../../.data/reporter-pack`

Expected: tests/typecheck/build pass and the tarball contains only `dist`, package metadata, and README.

- [ ] **Step 8: Commit**

```bash
git add packages/reporter
git commit -m "feat: add reporter link and sync commands"
```

---

### Task 8: Integrate Reporter Status and Revocation into Settings

**Files:**
- Create: `src/components/ReporterSettings.tsx`
- Create: `tests/reporter-settings.test.tsx`
- Create: `src/app/api/v1/reporters/[id]/revoke/route.ts`
- Create: `tests/reporter-revoke.test.ts`
- Modify: `src/lib/account-status.ts`
- Modify: `src/app/settings/page.tsx`
- Modify: `src/app/settings/actions.ts`
- Modify: `tests/account-status.test.ts`
- Modify: `tests/account-dashboard.test.tsx`

**Interfaces:**
- Consumes: owner reporter rows and verified usage totals
- Produces: reporter connection status, copyable link command, revoke/delete actions

- [ ] **Step 1: Write failing component and status tests**

Assert no-reporter state shows `npx aimaxxing link`; connected state shows machine label, fingerprint prefix, link date, last sync, and revoke action; revoked state is not counted; no key material renders. Assert separate revoke and delete-data controls. At the route level, assert authenticated-owner revocation, signed self-revocation, stale/altered/replayed request rejection, and reporter-scoped deletion.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run tests/reporter-settings.test.tsx tests/reporter-revoke.test.ts tests/account-status.test.ts tests/account-dashboard.test.tsx`

Expected: FAIL because reporter settings are absent.

- [ ] **Step 3: Implement settings queries and UI**

Extend account status with narrow reporter summaries. Render `ReporterSettings` in Connect AI usage. Use a labeled code block and copy button for the command, textual connection states, and accessible confirmations.

- [ ] **Step 4: Implement revoke/delete actions**

Require current-user ownership for Settings actions. Revoke sets `revokedAt`; delete removes only `reporterToolDays` rows for that reporter after exact reporter fingerprint confirmation. The API also verifies signed self-revocation for CLI unlink, including timestamp, request-ID replay protection, reporter ID, and `deleteData`. Revalidate Settings, profile, homepage, JSON, and card paths.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm vitest run tests/reporter-settings.test.tsx tests/reporter-revoke.test.ts tests/account-status.test.ts tests/account-dashboard.test.tsx tests/reporter-store.test.ts tests/queries.test.ts && pnpm typecheck`

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/ReporterSettings.tsx src/lib/account-status.ts src/app/api/v1/reporters src/app/settings tests/reporter-settings.test.tsx tests/reporter-revoke.test.ts tests/account-status.test.ts tests/account-dashboard.test.tsx
git commit -m "feat: manage usage reporters from settings"
```

---

### Task 9: Verify End to End, Deploy Web, and Prepare npm Release

**Files:**
- Modify only files required by verification failures

**Interfaces:**
- Consumes: completed reporter and web integration
- Produces: production reporter API and verified npm tarball

- [ ] **Step 1: Run all verification sequentially**

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm --filter aimaxxing typecheck
pnpm --filter aimaxxing build
pnpm --filter aimaxxing pack --pack-destination ../../.data/reporter-pack
git diff --check
git status --short --branch
```

Expected: zero failures and only intended changes.

- [ ] **Step 2: Run privacy and protocol acceptance locally**

Use synthetic fixture homes, not the real home directory, to prove scan output/payload has no sentinel content or paths. Start the web app with isolated PGlite, complete link approval, signed sync, repeated sync, revoke, and rejected post-revoke sync. Verify profile/card values match the submitted aggregate.

- [ ] **Step 3: Run an explicit real-log dry scan**

Run the packed reporter’s `scan` command against the audited machine. Do not transmit. Compare only aggregate counts/totals and warnings. Inspect stdout for accidental prompts, paths, repository names, or raw records before allowing a live link.

- [ ] **Step 4: Commit final verified corrections**

```bash
git add -A
git commit -m "fix: complete verified reporter flow"
```

Skip when clean.

- [ ] **Step 5: Push main and deploy web APIs**

```bash
git push origin main
pnpm dlx vercel@latest deploy --prod --yes --scope aivsomkars-projects
```

Require Ready state and canonical alias.

- [ ] **Step 6: Smoke-test production reporter flow**

Using the packed local CLI, scan, confirm, link through the signed-in browser, sync once, verify dashboard/profile/JSON/card/leaderboard agreement, sync again to prove idempotency, then leave the reporter active. Inspect production logs for stable events and absence of keys/payloads.

- [ ] **Step 7: Request npm release authorization**

Present package name, version, tarball contents, test counts, dry-scan privacy result, and exact `npm publish` command. Do not publish until the owner explicitly authorizes npm release and supplies or activates npm authentication.
