# AI Maxxing reporter

`aimaxxing` is the privacy-preserving local usage reporter for an AI Maxxing profile. It supports Node.js 22 or newer and runs only when you explicitly invoke it. It installs no daemon, hook, extension, or scheduled task.

## Commands

```bash
npx aimaxxing@latest import
npx aimaxxing scan
npx aimaxxing link
npx aimaxxing sync
npx aimaxxing status
npx aimaxxing unlink
```

`import` is the recommended first-run flow: it scans supported local sources, previews the aggregate, opens AI Maxxing for browser approval, links the machine, and uploads the approved initial snapshot. The production API at `https://www.aimaxxing.lol` is used by default.

`scan` is always offline. `link` links without uploading the first snapshot, while `sync` updates an existing linked reporter. `--yes` skips only the aggregate-transmission prompt; it never bypasses unlink or data-deletion confirmations. Set `AIMAXXING_API_URL` only while using a self-hosted or local instance.

## What leaves your machine

During browser linking, the reporter sends a generated machine ID, public signing key, and a generic operating-system label such as `macOS reporter`. It does not send the computer's hostname. After linking, only daily usage aggregates are sent: reporter ID, submission ID, timestamp, pricing version, tool, model, UTC day, session count, mutually exclusive uncached-input/output/cache token counts, cost, and an Ed25519 signature. The server recalculates Codex and Claude API-equivalent estimates from its matching versioned rate card; OpenCode cost comes from its own session database. An API estimate is not a subscription charge or a claim about your bill. Verified rows are stored separately per linked machine so a new snapshot cannot overwrite manual reports or another machine.

Prompts, responses, source code, reasoning, commands, tool arguments, file paths, repository names, titles, attachments, raw log records, session IDs, and record IDs are never included in the payload. The local private key and machine identity are stored in a mode-`0600` config file on POSIX systems and are redacted by `status`.

## Supported sources

- Claude Code JSONL under `~/.claude/projects`
- Codex CLI JSONL under `~/.codex/sessions`
- OpenCode's supported `opencode.db` session aggregate format under its platform data directory

OpenCode is opened read-only and queried with an explicit aggregate-column allowlist. Unknown models retain accurate token counts but can show `$0` estimated API-equivalent value until a reviewed pricing snapshot supports them. Pricing and token-accounting semantics are versioned in every upload; outdated reporters are rejected instead of being allowed to overwrite corrected data.

`unlink` sends a signed, replay-protected revocation request. You separately choose whether that reporter's previously synced rows should be deleted. Publishing an AI Maxxing profile remains a separate account-level choice in the web settings.
