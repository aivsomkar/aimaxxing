# AI Maxxing reporter

`aimaxxing` is the privacy-preserving local usage reporter for an AI Maxxing profile. It supports Node.js 22 or newer and runs only when you explicitly invoke it. It installs no daemon, hook, extension, or scheduled task.

## Commands

```bash
npx aimaxxing scan
npx aimaxxing link
npx aimaxxing sync
npx aimaxxing status
npx aimaxxing unlink
```

`scan` is always offline. `link` scans and shows the proposed aggregate before its first network request. `sync` scans and asks before transmission. `--yes` skips only the transmission confirmation; it never bypasses unlink or data-deletion confirmations. Set `AIMAXXING_API_URL` to the web app origin while using a self-hosted or local instance.

## What leaves your machine

Only daily aggregates are sent: reporter ID, submission ID, timestamp, pricing version, tool, model, UTC day, session count, input/output/cache token counts, estimated cost, and an Ed25519 signature. The server stores verified rows separately per linked machine so a new snapshot cannot overwrite manual reports or another machine.

Prompts, responses, source code, reasoning, commands, tool arguments, file paths, repository names, titles, attachments, raw log records, session IDs, and record IDs are never included in the payload. The local private key and machine identity are stored in a mode-`0600` config file on POSIX systems and are redacted by `status`.

## Supported sources

- Claude Code JSONL under `~/.claude/projects`
- Codex CLI JSONL under `~/.codex/sessions`
- OpenCode's supported `opencode.db` session aggregate format under its platform data directory

OpenCode is opened read-only and queried with an explicit aggregate-column allowlist. Unknown models retain accurate token counts but can show `$0` estimated cost until a reviewed pricing snapshot supports them. Pricing is versioned by date in every upload.

`unlink` sends a signed, replay-protected revocation request. You separately choose whether that reporter's previously synced rows should be deleted. Publishing an AI Maxxing profile remains a separate account-level choice in the web settings.
