// Guards Task 6's carry-over: someone edits src/db/schema.ts (e.g. reverts a
// bigint column back to integer) without regenerating the drizzle migration.
// The rest of the suite applies drizzle/0000_*.sql directly against pglite
// (see tests/ingest-db.test.ts) rather than reading schema.ts, so it never
// notices when the two diverge - only this test does.
//
// Mechanism: `drizzle-kit check` was verified empirically (see task-7 report)
// to NOT catch this - it only validates internal consistency of the
// migrations folder (the journal/snapshot chain), and reports "Everything's
// fine" even when schema.ts has drifted from the committed SQL. Instead this
// test runs `drizzle-kit generate` against a scratch copy of the migrations
// folder: generate diffs the current schema.ts against the latest snapshot
// and writes a new migration file only if there is a difference to capture.
// When schema.ts matches the committed migration, generate writes nothing
// ("No schema changes, nothing to migrate"); drift shows up as a new file.
import { describe, it, expect, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, cpSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(dirname, '..')

let scratch: string | undefined

afterEach(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true })
  scratch = undefined
})

describe('schema-vs-migration drift guard', () => {
  it('drizzle-kit generate produces no new migration when schema.ts matches the committed migration', () => {
    scratch = mkdtempSync(path.join(tmpdir(), 'drizzle-drift-'))
    const outDir = path.join(scratch, 'drizzle')
    cpSync(path.join(repoRoot, 'drizzle'), outDir, { recursive: true })
    const before = readdirSync(outDir).filter((f) => f.endsWith('.sql'))

    const configPath = path.join(scratch, 'drizzle.config.ts')
    writeFileSync(
      configPath,
      `import { defineConfig } from 'drizzle-kit'
export default defineConfig({
  schema: ${JSON.stringify(path.join(repoRoot, 'src/db/schema.ts'))},
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: 'postgres://unused:unused@localhost:5432/unused' },
})
`,
    )

    execFileSync(path.join(repoRoot, 'node_modules/.bin/drizzle-kit'), ['generate', '--config', configPath], {
      cwd: scratch,
      stdio: 'pipe',
    })

    const after = readdirSync(outDir).filter((f) => f.endsWith('.sql'))
    expect(after).toEqual(before)
  }, 20_000)
})
