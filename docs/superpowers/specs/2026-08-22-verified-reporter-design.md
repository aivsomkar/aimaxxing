# AI Maxxing Verified Reporter Design

**Date:** 2026-08-22
**Status:** Approved in chat on 2026-08-22
**Depends on:** `2026-08-22-product-repair-share-card-design.md`

## 1. Goal

Build the `aimaxxing` npm reporter so a developer can scan Claude Code, Codex CLI, and OpenCode usage locally, inspect the exact aggregates, link a machine to their signed-in AI Maxxing account, and transmit only approved daily totals as verified usage.

The command promised by the product is:

```text
npx aimaxxing link
```

The npm package name was unclaimed when checked on 2026-08-22. Publishing to npm requires the owner’s npm credentials and remains a release action after implementation verification.

## 2. Privacy Contract

Only these fields may leave the machine:

- tool identifier;
- model identifier;
- UTC calendar day;
- distinct session count;
- input tokens;
- output tokens;
- cache-read tokens;
- cache-write tokens;
- estimated cost in USD;
- reporter ID, submission ID, timestamp, and signature needed for verification.

The reporter never transmits prompts, responses, reasoning, code, tool arguments, command output, file paths, working directories, repository names, Git branches, attachments, session titles, or raw log records.

The scanner creates aggregate objects directly while streaming each source. It does not create a sanitized copy of the raw logs.

## 3. Package Structure

The repository becomes a pnpm workspace with the existing Next.js application at the root and a publishable package at `packages/reporter`.

```text
packages/reporter/
  package.json
  tsconfig.json
  src/cli.ts
  src/config.ts
  src/crypto.ts
  src/http.ts
  src/pricing.ts
  src/report.ts
  src/scan.ts
  src/adapters/claude-code.ts
  src/adapters/codex-cli.ts
  src/adapters/opencode.ts
  src/adapters/types.ts
  tests/fixtures/
  tests/*.test.ts
```

The package supports Node.js 22 and newer. It emits an executable ESM CLI and contains no Next.js or third-party database dependency. OpenCode SQLite access uses the built-in `node:sqlite` module.

## 4. Commands

### `npx aimaxxing scan`

- Finds supported local data stores.
- Streams and aggregates logs without making a network request.
- Prints a table grouped by tool, model, and day plus all-time totals.
- Explains which tools were not found or had an unsupported format.
- Exits successfully when at least one adapter can scan, even if another adapter is unavailable.

### `npx aimaxxing link`

1. Runs the local scan first.
2. Prints the exact aggregate payload summary.
3. Asks whether to continue before the first network request.
4. Generates an Ed25519 keypair and random machine identifier locally.
5. Starts a short-lived device-link session.
6. Opens the verification URL and also prints it with a human-readable code.
7. Polls until the signed-in user approves or the session expires.
8. Stores the linked reporter identity and private key with owner-only filesystem permissions.
9. Signs and sends the approved aggregate report.

Declining at step 3 writes no configuration and sends nothing.

### `npx aimaxxing sync`

- Requires an existing linked reporter.
- Scans locally and prints the aggregate and the delta from the last successful submission.
- Requires confirmation by default.
- `--yes` is available for an intentional scheduled job.
- Sends an idempotent signed snapshot. Repeating the same snapshot does not duplicate usage.

### `npx aimaxxing status`

- Shows linked handle, reporter ID prefix, last local scan, last successful server sync, and detected adapters.
- Never prints the private key or full device credentials.

### `npx aimaxxing unlink`

- Requires confirmation.
- Revokes the reporter on the server.
- Deletes the local private key and link configuration.
- Removes verified rows last written by that reporter only after a second explicit confirmation.
- Never removes manual rows, portfolio projects, GitHub output, social handles, or the user account.

## 5. Local Adapters

All adapters implement:

```ts
type UsageAggregate = {
  tool: 'claude-code' | 'codex-cli' | 'opencode'
  model: string
  day: string
  sessions: number
  tokensIn: number
  tokensOut: number
  cacheRead: number
  cacheWrite: number
  costUsd: number
}

type ScanResult = {
  rows: UsageAggregate[]
  filesRead: number
  recordsRead: number
  warnings: { adapter: string; code: string; message: string }[]
}

interface UsageAdapter {
  id: UsageAggregate['tool']
  detect(): Promise<boolean>
  scan(): Promise<ScanResult>
}
```

Rows are merged by `(tool, model, day)`. Numeric totals use safe integers and reject negative, non-finite, or out-of-range source values.

### 5.1 Claude Code

- Default source: `~/.claude/projects/**/*.jsonl`.
- Reads assistant records containing `message.model` and `message.usage`.
- Maps `input_tokens`, `output_tokens`, `cache_read_input_tokens`, and `cache_creation_input_tokens` to the canonical token fields.
- Counts distinct session IDs per model and day.
- Deduplicates repeated assistant messages by stable message ID plus request ID when present.
- Ignores user content, assistant content, tool results, snapshots, attachments, paths, and Git metadata.

### 5.2 Codex CLI

- Default source: `~/.codex/sessions/**/*.jsonl`.
- Reads session metadata for stable session ID and model.
- Reads `payload.info.total_token_usage` snapshots.
- Uses the greatest cumulative total for each session rather than summing repeated cumulative events.
- Maps input, output, cached-input, and cache-write-input counts to canonical token fields.
- Counts one session for each distinct session ID represented in the aggregate.
- Ignores response content, summaries, tool calls, tool output, working directories, repository metadata, and encrypted content.

### 5.3 OpenCode

- Default source on macOS and Linux: `~/.local/share/opencode/opencode.db`; Windows resolves the equivalent OpenCode data root before appending `opencode.db`.
- Opens SQLite read-only through Node 22 `node:sqlite`.
- Checks `PRAGMA table_info(session)` for the exact supported columns: `id`, `model`, `cost`, `tokens_input`, `tokens_output`, `tokens_reasoning`, `tokens_cache_read`, `tokens_cache_write`, and `time_created`.
- Selects only those columns from `session`; it never selects `directory`, `path`, `title`, metadata, messages, parts, or content tables.
- Parses `model` only for provider and model identifiers, maps token columns directly, uses recorded `cost`, and counts each session row once.
- Returns a named `unsupported_format` warning when the database exists but the required column contract is incomplete.
- Absence of OpenCode is reported as `not_found` and does not block other adapters.

OpenCode was configured but had no local data store on the audited machine. Fixture coverage therefore creates a temporary SQLite database with the exact supported `session` columns before the adapter is considered complete.

## 6. Sessions, Days, and Cost

- A session is a distinct source-native session ID, never a message count.
- Calendar days are derived from source timestamps and normalized to UTC.
- Token counts come from source logs, not from text estimation.
- Cost uses a versioned model-pricing table bundled with the reporter unless the source provides a trusted explicit cost.
- Unknown models retain accurate tokens and sessions but use cost `0` plus an `unknown_price` warning.
- Every payload includes the pricing-table version so historical reports remain explainable.

## 7. Device Linking

The flow follows a device-authorization pattern without storing an OAuth access token in the CLI.

### Server records

```text
reporter_link_sessions
  id, device_code_hash, user_code_hash, public_key, machine_label,
  user_id, expires_at, approved_at, consumed_at, created_at

reporters
  id, user_id, machine_id_hash, public_key, linked_at,
  last_seen_at, revoked_at

reporter_submissions
  id, reporter_id, payload_hash, pricing_version, received_at

reporter_action_requests
  id, reporter_id, request_id, action, received_at
  unique(reporter_id, request_id)

reporter_tool_days
  id, reporter_id, user_id, tool, model, day, sessions,
  tokens_in, tokens_out, cache_read, cache_write, cost_usd, created_at
  unique(reporter_id, tool, model, day)
```

Raw device codes and private keys are never stored by the server. Link sessions expire after ten minutes and can be consumed only once.

### Endpoints and page

- `POST /api/v1/reporters/link/start`: accepts public key and a non-sensitive machine label, then returns the raw device code once, user code, verification URL, interval, and expiry.
- `POST /api/v1/reporters/link/status`: accepts the raw device code and returns pending, approved with reporter ID and account handle, expired, or denied.
- `/link`: requires GitHub sign-in, displays the code and public-key fingerprint, and asks the user to approve or deny the machine.
- `POST /api/v1/reporters/[id]/revoke`: accepts either an authenticated owner session or a signed self-revocation from that active reporter. The signed body contains `reporterId`, `action: 'revoke'`, `issuedAt`, `requestId`, `deleteData`, and `signature`.

Polling is rate-limited and uses the server-provided interval. Expired, consumed, or denied codes cannot be revived.

Signed self-revocation uses the same canonicalization, five-minute clock-skew limit, and active-key verification rules as report submission. The server records `(reporter_id, request_id)` before revocation in the same transaction so action replays are rejected. An authenticated owner may revoke an already inactive reporter or separately delete its rows.

## 8. Signed Report Protocol

Each report submission uses:

```ts
type SignedReport = {
  reporterId: string
  submissionId: string
  issuedAt: string
  pricingVersion: string
  rows: UsageAggregate[]
  signature: string
}
```

The CLI canonicalizes the unsigned payload with stable key order and signs its UTF-8 bytes using Ed25519. The server:

1. loads the active reporter public key;
2. rejects timestamps outside a five-minute clock-skew window;
3. rejects an existing submission ID;
4. validates the report schema and sanity caps;
5. verifies the Ed25519 signature before opening a transaction;
6. upserts reporter-owned `reporter_tool_days` rows and records the submission atomically;
7. updates `last_seen_at` only after commit.

The response never echoes raw database or signature errors.

## 9. Reporter Ownership and Idempotency

Existing `tool_days` remains the manual-report table and retains its current account/tool/model/day uniqueness. Verified rows live in `reporter_tool_days`, where reporter ownership is required and uniqueness is `(reporter_id, tool, model, day)`.

Each reporter submission is a complete snapshot for that reporter. Inside one transaction the server upserts rows present in the snapshot and deletes that reporter’s older rows absent from the new snapshot. Rows from another reporter on the same account are not touched. Public queries continue aggregating by account, tool, model, and day.

This snapshot model makes rescans deterministic and prevents duplicate totals after repeated synchronization.

## 10. Settings Integration

The account dashboard shows:

- connected reporter count;
- each machine label and public-key fingerprint prefix;
- linked date and last successful sync;
- revoke action;
- verified usage totals derived from reporter-owned rows;
- copyable `npx aimaxxing link` command when no reporter is connected.

Revocation stops future submissions immediately. Deleting reporter data is a separate explicit action.

## 11. Security and Abuse Controls

- Ed25519 keys are generated locally with the Node crypto module.
- Local private-key configuration is created with mode `0600` where supported.
- Device and user codes use cryptographically secure randomness and are stored only as hashes.
- Approval requires an authenticated browser session and displays the machine fingerprint.
- Report endpoints enforce body-size, row-count, per-row, daily, and request-rate caps.
- Submission IDs prevent replay.
- Database mutations are transactional.
- Parser warnings never include raw lines or file paths in network payloads.
- Server logs contain stable error codes, reporter ID prefixes, and submission IDs, never keys or usage payloads.

## 12. Failure Behavior

- A malformed source record is skipped with a local count and adapter warning.
- An unsupported adapter does not block supported adapters.
- No detected usage produces a successful scan with clear guidance and no network call.
- Link expiry preserves the locally generated key but stores no linked configuration; retry starts a new link session.
- Network failure leaves the previous server snapshot intact.
- Invalid signatures, revoked reporters, replayed IDs, and expired timestamps fail without partial writes.
- Unknown pricing never suppresses accurate token and session counts.

## 13. Testing and Acceptance

Fixtures contain synthetic metadata and token counts only. They contain no real prompts, code, paths, repositories, or account identifiers.

Automated tests must prove:

- every adapter detects, parses, deduplicates, and aggregates its supported formats;
- content and path fields never enter `UsageAggregate` or serialized payloads;
- Codex cumulative snapshots use the maximum per session;
- sessions are distinct source session IDs;
- UTC day grouping is stable;
- unknown pricing preserves tokens and emits a warning;
- declining confirmation makes zero HTTP calls;
- link codes expire, are one-time, and bind only to the approving user;
- canonical payload bytes and Ed25519 verification match;
- replay, skew, revocation, invalid signature, oversized payload, and sanity-cap violations fail;
- snapshot replacement is reporter-scoped and transactional;
- unlink cannot delete manual rows or another reporter’s rows;
- CLI status output never contains the private key.

End-to-end acceptance on the audited machine requires:

1. `scan` detects Claude Code and Codex CLI logs and reports OpenCode as not found or unsupported without exposing raw content.
2. The displayed totals equal independently computed synthetic-fixture expectations.
3. `link` requires confirmation before its first network request.
4. Browser approval binds the reporter to `@aivsomkar`.
5. The first signed sync creates verified usage rows.
6. The private profile, published profile, leaderboard, JSON, and AI Maxxing card display matching aggregates.
7. Re-running the same scan does not double totals.
8. Revocation blocks another submission.
9. Full web and reporter tests, typechecks, builds, package dry-run, and production smoke tests pass.

## 14. Release

The implementation produces a locally testable and packable npm artifact. Publishing `aimaxxing` to npm and announcing the command are separate external release actions requiring the owner’s npm authentication. The web dashboard must not advertise a globally runnable npm command until the package is published successfully.

## 15. Scope Boundaries

The first reporter release performs explicit scans and syncs. It does not install a daemon, background service, shell hook, IDE extension, scheduled task, Cursor parser, or repository attribution. Those additions require separate consent and reliability designs.
