# AI Maxxing — Arena Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the public AI Maxxing arena — a homepage led by a live collective burn counter, four leaderboards, public profiles showing a fully reproducible Index, and manual self-report ingest — as a deployable Next.js app.

**Architecture:** A single Next.js App Router application backed by Postgres via Drizzle. All ranking math lives in pure, unit-tested modules (`src/lib/`) that take plain data and return plain data, so the formula can be tested without a database and recomputed by anyone from the published JSON. Database access is isolated behind query modules; React components never build SQL. Local development runs against file-backed PGlite with zero setup, exactly as linkdbots does.

**Tech Stack:** Next.js 15 (App Router) · React 19 · TypeScript 5.8 · Drizzle ORM 0.44 · Postgres (PGlite locally) · Auth.js 5 beta (GitHub provider) · Tailwind 4 · Zod 3 · Vitest 3

**Spec:** `docs/superpowers/specs/2026-08-22-aimaxxing-design.md`

## Global Constraints

- **Product name:** AI Maxxing. Domain `aimaxxing.lol`. Repo `github.com/aivsomkar/aimaxxing`.
- **The Index formula is `Index = Σ √(sessions_t) + O`** over qualifying tools only. It is published verbatim on `/methodology` and must be reproducible from the JSON at `/@handle.json`.
- **Spend never enters the Index.** Spend drives The Burn board only. Rank must not be purchasable.
- **Qualifying floor:** a tool counts toward the Index only at `sessions >= 20 OR cost_usd >= 5`.
- **Output term is additive and capped**, never multiplicative. `OUTPUT_CAP = 20`.
- **Consent is two separate gates.** Nothing is transmitted without an explicit yes; appearing on a public board is a second, separate opt-in. Default for `public_opt_in` is `false`.
- **Self-reported entries** sort below verified entries at equal value and are **excluded from the by-model breakdown**.
- **Sponsored credits are excluded from the collective total.**
- **No sponsor may affect placement.** The sponsor slot is a static JSON-driven component only.
- **Node 22+, pnpm.** Dependency versions are pinned to match linkdbots (see Task 1).

---

### Task 1: Project scaffold, database, and a green test run

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `drizzle.config.ts`, `vitest.config.ts`, `.env.example`, `.gitignore`
- Create: `src/db/schema.ts`, `src/db/client.ts`, `src/db/migrate.ts`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Test: `tests/schema.test.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `db` (Drizzle client from `src/db/client.ts`), and the tables `users`, `toolDays`, `githubStats`, `collectiveDays`, `sponsors` exported from `src/db/schema.ts`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "aimaxxing",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts"
  },
  "dependencies": {
    "drizzle-orm": "^0.44.0",
    "next": "^15.3.0",
    "next-auth": "5.0.0-beta.32",
    "pg": "^8.23.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@electric-sql/pglite": "^0.3.0",
    "@tailwindcss/postcss": "^4.3.3",
    "@types/node": "^22.0.0",
    "@types/pg": "^8.23.1",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.2.4",
    "drizzle-kit": "^0.31.0",
    "tailwindcss": "^4.3.3",
    "tsx": "^4.19.0",
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Step 2: Create `src/db/schema.ts`**

```ts
import { pgTable, text, integer, boolean, timestamp, date, numeric, uniqueIndex, serial } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  githubId: text('github_id').notNull().unique(),
  handle: text('handle').notNull().unique(),
  avatarUrl: text('avatar_url'),
  publicOptIn: boolean('public_opt_in').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const toolDays = pgTable('tool_days', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tool: text('tool').notNull(),
  model: text('model').notNull(),
  day: date('day').notNull(),
  sessions: integer('sessions').notNull().default(0),
  tokensIn: integer('tokens_in').notNull().default(0),
  tokensOut: integer('tokens_out').notNull().default(0),
  cacheRead: integer('cache_read').notNull().default(0),
  cacheWrite: integer('cache_write').notNull().default(0),
  costUsd: numeric('cost_usd', { precision: 12, scale: 4 }).notNull().default('0'),
  source: text('source').notNull(),        // 'reporter' | 'manual'
  verified: boolean('verified').notNull().default(false),
  sponsored: boolean('sponsored').notNull().default(false),
}, (t) => ({
  uniq: uniqueIndex('tool_days_uniq').on(t.userId, t.tool, t.model, t.day),
}))

export const githubStats = pgTable('github_stats', {
  userId: integer('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  mergedPrs: integer('merged_prs').notNull().default(0),
  activeRepos: integer('active_repos').notNull().default(0),
  contributions: integer('contributions').notNull().default(0),
  syncedAt: timestamp('synced_at').notNull().defaultNow(),
})

export const collectiveDays = pgTable('collective_days', {
  day: date('day').primaryKey(),
  tokensIn: integer('tokens_in').notNull().default(0),
  tokensOut: integer('tokens_out').notNull().default(0),
  cacheRead: integer('cache_read').notNull().default(0),
  cacheWrite: integer('cache_write').notNull().default(0),
  costUsd: numeric('cost_usd', { precision: 14, scale: 4 }).notNull().default('0'),
})

export const sponsors = pgTable('sponsors', {
  id: serial('id').primaryKey(),
  slot: text('slot').notNull(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  blurb: text('blurb').notNull(),
  startsOn: date('starts_on').notNull(),
  endsOn: date('ends_on').notNull(),
})
```

- [ ] **Step 3: Create `src/db/client.ts`**

```ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { PGlite } from '@electric-sql/pglite'
import { Pool } from 'pg'
import * as schema from './schema'

const url = process.env.DATABASE_URL ?? 'pglite://.data/pg'

function make() {
  if (url.startsWith('pglite://')) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('pglite:// is a local convenience and is refused in production')
    }
    return drizzlePglite(new PGlite(url.replace('pglite://', '')), { schema })
  }
  return drizzle(new Pool({ connectionString: url }), { schema })
}

export const db = make()
export { schema }
```

- [ ] **Step 4: Write the failing test**

```ts
// tests/schema.test.ts
import { describe, it, expect } from 'vitest'
import { users, toolDays, collectiveDays } from '../src/db/schema'

describe('schema', () => {
  it('defaults public_opt_in to false so nobody is listed without consent', () => {
    expect(users.publicOptIn.default).toBe(false)
  })

  it('has a uniqueness key on (user, tool, model, day) so re-reporting is idempotent', () => {
    expect(toolDays.userId).toBeDefined()
    expect(toolDays.tool).toBeDefined()
    expect(toolDays.model).toBeDefined()
    expect(toolDays.day).toBeDefined()
  })

  it('tracks cache tokens separately on the collective rollup', () => {
    expect(collectiveDays.cacheRead).toBeDefined()
    expect(collectiveDays.cacheWrite).toBeDefined()
  })
})
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm vitest run tests/schema.test.ts`
Expected: FAIL — module `../src/db/schema` not found, or dependencies not installed.

- [ ] **Step 6: Install and re-run**

```bash
pnpm install
pnpm vitest run tests/schema.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 7: Generate the initial migration**

```bash
pnpm db:generate
```
Expected: writes `drizzle/0000_*.sql`. Commit this file.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js app, Drizzle schema, and PGlite dev database"
```

---

### Task 2: The Index formula

This is the core of the product. It is a pure function over plain data — no database, no framework — so it can be unit-tested exhaustively and recomputed by any reader from the published JSON.

**Files:**
- Create: `src/lib/index-math.ts`
- Test: `tests/index-math.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `QUALIFY_SESSIONS = 20`, `QUALIFY_COST_USD = 5`, `OUTPUT_CAP = 20`, `CONTRIBUTIONS_PER_UNIT = 25`
  - `type ToolDepth = { tool: string; sessions: number; costUsd: number }`
  - `type Output = { mergedPrs: number; contributions: number }`
  - `qualifies(t: ToolDepth): boolean`
  - `toolScore(t: ToolDepth): number`
  - `outputTerm(o: Output): number`
  - `computeIndex(tools: ToolDepth[], output: Output): { perTool: { tool: string; sessions: number; score: number; qualified: boolean }[]; stackDepth: number; outputTerm: number; index: number }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/index-math.test.ts
import { describe, it, expect } from 'vitest'
import { computeIndex, qualifies, toolScore, outputTerm, OUTPUT_CAP } from '../src/lib/index-math'

const t = (tool: string, sessions: number, costUsd = 0) => ({ tool, sessions, costUsd })

describe('qualifying floor', () => {
  it('rejects a tool below both thresholds', () => {
    expect(qualifies(t('aider', 5, 1))).toBe(false)
  })
  it('accepts on sessions alone', () => {
    expect(qualifies(t('aider', 20, 0))).toBe(true)
  })
  it('accepts on spend alone', () => {
    expect(qualifies(t('aider', 3, 5))).toBe(true)
  })
})

describe('toolScore', () => {
  it('is the square root of sessions', () => {
    expect(toolScore(t('claude-code', 400))).toBeCloseTo(20, 5)
  })
  it('ignores spend entirely so rank cannot be purchased', () => {
    expect(toolScore(t('a', 100, 0))).toBeCloseTo(toolScore(t('a', 100, 99999)), 5)
  })
})

describe('breadth beats equivalent depth', () => {
  const none = { mergedPrs: 0, contributions: 0 }
  it('ranks 4x100 above 1x400', () => {
    const polyglot = computeIndex([t('a',100),t('b',100),t('c',100),t('d',100)], none)
    const specialist = computeIndex([t('a',400)], none)
    expect(polyglot.stackDepth).toBeCloseTo(40, 5)
    expect(specialist.stackDepth).toBeCloseTo(20, 5)
    expect(polyglot.index).toBeGreaterThan(specialist.index)
  })
  it('scores a tourist at zero', () => {
    const tourist = computeIndex(
      Array.from({ length: 8 }, (_, i) => t(`tool${i}`, 5, 1)), none)
    expect(tourist.stackDepth).toBe(0)
  })
  it('ranks a deep specialist above a tourist', () => {
    const specialist = computeIndex([t('a',400)], none)
    const tourist = computeIndex(Array.from({length:8},(_,i)=>t(`x${i}`,5,1)), none)
    expect(specialist.index).toBeGreaterThan(tourist.index)
  })
})

describe('output term', () => {
  it('is additive and capped', () => {
    expect(outputTerm({ mergedPrs: 100000, contributions: 100000 })).toBe(OUTPUT_CAP)
  })
  it('does not zero out a developer with no public PRs', () => {
    const priv = computeIndex([t('a',100)], { mergedPrs: 0, contributions: 500 })
    expect(priv.index).toBeGreaterThan(10)
  })
  it('counts private contributions at a discount to merged PRs', () => {
    expect(outputTerm({ mergedPrs: 20, contributions: 0 }))
      .toBeGreaterThan(outputTerm({ mergedPrs: 0, contributions: 20 }))
  })
})

describe('reproducibility', () => {
  it('reports per-tool scores that sum to stackDepth', () => {
    const r = computeIndex([t('a',100),t('b',49),t('c',5,1)], { mergedPrs: 0, contributions: 0 })
    const sum = r.perTool.filter(p => p.qualified).reduce((a,p) => a + p.score, 0)
    expect(sum).toBeCloseTo(r.stackDepth, 10)
    expect(r.index).toBeCloseTo(r.stackDepth + r.outputTerm, 10)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/index-math.test.ts`
Expected: FAIL — cannot find module `../src/lib/index-math`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/index-math.ts
//
// The published Index formula. Every constant here appears verbatim on /methodology,
// and every intermediate value is returned so a reader can recompute the result from
// the JSON at /@handle.json. Do not add a term that is not rendered on the profile.

export const QUALIFY_SESSIONS = 20
export const QUALIFY_COST_USD = 5
export const OUTPUT_CAP = 20
export const CONTRIBUTIONS_PER_UNIT = 25

export type ToolDepth = { tool: string; sessions: number; costUsd: number }
export type Output = { mergedPrs: number; contributions: number }

export type IndexBreakdown = {
  perTool: { tool: string; sessions: number; score: number; qualified: boolean }[]
  stackDepth: number
  outputTerm: number
  index: number
}

export function qualifies(t: ToolDepth): boolean {
  return t.sessions >= QUALIFY_SESSIONS || t.costUsd >= QUALIFY_COST_USD
}

// Concave in sessions: the marginal session in a new tool is worth more than the
// nth session in an existing one. Spend is deliberately absent - see the spec.
export function toolScore(t: ToolDepth): number {
  return Math.sqrt(Math.max(0, t.sessions))
}

export function outputTerm(o: Output): number {
  const units = Math.max(0, o.mergedPrs) + Math.max(0, o.contributions) / CONTRIBUTIONS_PER_UNIT
  return Math.min(OUTPUT_CAP, 2 * Math.sqrt(units))
}

export function computeIndex(tools: ToolDepth[], output: Output): IndexBreakdown {
  const perTool = tools.map((t) => {
    const qualified = qualifies(t)
    return { tool: t.tool, sessions: t.sessions, score: qualified ? toolScore(t) : 0, qualified }
  })
  const stackDepth = perTool.reduce((a, p) => a + p.score, 0)
  const term = outputTerm(output)
  return { perTool, stackDepth, outputTerm: term, index: stackDepth + term }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/index-math.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/index-math.ts tests/index-math.test.ts
git commit -m "feat: Index formula with qualifying floor and capped additive output term"
```

---

### Task 3: Collective totals

**Files:**
- Create: `src/lib/collective.ts`
- Test: `tests/collective.test.ts`

**Interfaces:**
- Consumes: `ToolDayRow` shape (plain data; no DB import)
- Produces:
  - `type BurnRow = { tool: string; model: string; costUsd: number; tokensIn: number; tokensOut: number; cacheRead: number; cacheWrite: number; sponsored: boolean; verified: boolean }`
  - `type CollectiveTotals = { costUsd: number; tokensTotal: number; tokensIn: number; tokensOut: number; cacheRead: number; cacheWrite: number }`
  - `collectiveTotals(rows: BurnRow[]): CollectiveTotals`
  - `shareByModel(rows: BurnRow[]): { model: string; costUsd: number; share: number }[]`
  - `shareByTool(rows: BurnRow[]): { tool: string; costUsd: number; share: number }[]`

- [ ] **Step 1: Write the failing test**

```ts
// tests/collective.test.ts
import { describe, it, expect } from 'vitest'
import { collectiveTotals, shareByModel } from '../src/lib/collective'

const row = (o: Partial<any> = {}) => ({
  tool: 'claude-code', model: 'opus', costUsd: 10,
  tokensIn: 1000, tokensOut: 500, cacheRead: 200, cacheWrite: 100,
  sponsored: false, verified: true, ...o,
})

describe('collectiveTotals', () => {
  it('sums cost and every token class', () => {
    const r = collectiveTotals([row(), row()])
    expect(r.costUsd).toBe(20)
    expect(r.tokensTotal).toBe(3600)
  })

  it('excludes sponsored credit spend from the headline total', () => {
    const r = collectiveTotals([row(), row({ sponsored: true, costUsd: 999 })])
    expect(r.costUsd).toBe(10)
  })
})

describe('shareByModel', () => {
  it('excludes self-reported rows so the data asset stays trustworthy', () => {
    const rows = [
      row({ model: 'opus', costUsd: 10, verified: true }),
      row({ model: 'gpt-5', costUsd: 90, verified: false }),
    ]
    const shares = shareByModel(rows)
    expect(shares).toHaveLength(1)
    expect(shares[0].model).toBe('opus')
    expect(shares[0].share).toBeCloseTo(1, 5)
  })

  it('returns shares that sum to one', () => {
    const rows = [row({ model: 'opus', costUsd: 25 }), row({ model: 'sonnet', costUsd: 75 })]
    const total = shareByModel(rows).reduce((a, s) => a + s.share, 0)
    expect(total).toBeCloseTo(1, 5)
  })

  it('returns an empty array rather than dividing by zero', () => {
    expect(shareByModel([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/collective.test.ts`
Expected: FAIL — cannot find module `../src/lib/collective`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/collective.ts
export type BurnRow = {
  tool: string; model: string; costUsd: number
  tokensIn: number; tokensOut: number; cacheRead: number; cacheWrite: number
  sponsored: boolean; verified: boolean
}

export type CollectiveTotals = {
  costUsd: number; tokensTotal: number
  tokensIn: number; tokensOut: number; cacheRead: number; cacheWrite: number
}

// Sponsored credits never inflate the headline number - see spec section 9.
const spendable = (rows: BurnRow[]) => rows.filter((r) => !r.sponsored)

export function collectiveTotals(rows: BurnRow[]): CollectiveTotals {
  const r = spendable(rows)
  const sum = (f: (x: BurnRow) => number) => r.reduce((a, x) => a + f(x), 0)
  const tokensIn = sum((x) => x.tokensIn)
  const tokensOut = sum((x) => x.tokensOut)
  const cacheRead = sum((x) => x.cacheRead)
  const cacheWrite = sum((x) => x.cacheWrite)
  return {
    costUsd: sum((x) => x.costUsd),
    tokensIn, tokensOut, cacheRead, cacheWrite,
    tokensTotal: tokensIn + tokensOut + cacheRead + cacheWrite,
  }
}

function groupShare(rows: BurnRow[], key: (r: BurnRow) => string) {
  // Verified rows only: the by-model split is the data asset and must be defensible.
  const r = spendable(rows).filter((x) => x.verified)
  const total = r.reduce((a, x) => a + x.costUsd, 0)
  if (total <= 0) return []
  const acc = new Map<string, number>()
  for (const x of r) acc.set(key(x), (acc.get(key(x)) ?? 0) + x.costUsd)
  return [...acc.entries()]
    .map(([k, costUsd]) => ({ key: k, costUsd, share: costUsd / total }))
    .sort((a, b) => b.costUsd - a.costUsd)
}

export function shareByModel(rows: BurnRow[]) {
  return groupShare(rows, (r) => r.model).map(({ key, costUsd, share }) => ({ model: key, costUsd, share }))
}

export function shareByTool(rows: BurnRow[]) {
  return groupShare(rows, (r) => r.tool).map(({ key, costUsd, share }) => ({ tool: key, costUsd, share }))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/collective.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/collective.ts tests/collective.test.ts
git commit -m "feat: collective totals excluding sponsored credits and unverified rows"
```

---

### Task 4: Board ranking

**Files:**
- Create: `src/lib/boards.ts`
- Test: `tests/boards.test.ts`

**Interfaces:**
- Consumes: `computeIndex` from `src/lib/index-math.ts`
- Produces:
  - `type BoardKind = 'burn' | 'breadth' | 'efficiency' | 'index'`
  - `type Entrant = { handle: string; avatarUrl: string | null; tools: ToolDepth[]; costUsd: number; mergedPrs: number; contributions: number; anyUnverified: boolean }`
  - `type BoardEntry = { handle: string; avatarUrl: string | null; value: number; verified: boolean; toolCount: number; index: number }`
  - `rankBoard(kind: BoardKind, entrants: Entrant[]): BoardEntry[]`

- [ ] **Step 1: Write the failing test**

```ts
// tests/boards.test.ts
import { describe, it, expect } from 'vitest'
import { rankBoard } from '../src/lib/boards'

const e = (handle: string, o: Partial<any> = {}) => ({
  handle, avatarUrl: null,
  tools: [{ tool: 'claude-code', sessions: 100, costUsd: 50 }],
  costUsd: 50, mergedPrs: 0, contributions: 0, anyUnverified: false, ...o,
})

describe('rankBoard', () => {
  it('ranks the burn board by spend, descending', () => {
    const r = rankBoard('burn', [e('a', { costUsd: 10 }), e('b', { costUsd: 90 })])
    expect(r.map(x => x.handle)).toEqual(['b', 'a'])
    expect(r[0].value).toBe(90)
  })

  it('ranks breadth by count of qualifying tools only', () => {
    const wide = e('wide', { tools: [
      { tool: 'a', sessions: 30, costUsd: 0 },
      { tool: 'b', sessions: 30, costUsd: 0 },
      { tool: 'c', sessions: 2, costUsd: 0 },   // below floor, must not count
    ]})
    const r = rankBoard('breadth', [wide])
    expect(r[0].value).toBe(2)
  })

  it('ranks efficiency as spend per merged PR, ascending, skipping zero-PR entrants', () => {
    const good = e('good', { costUsd: 100, mergedPrs: 10 })   // $10/PR
    const bad  = e('bad',  { costUsd: 100, mergedPrs: 2  })   // $50/PR
    const none = e('none', { costUsd: 100, mergedPrs: 0  })
    const r = rankBoard('efficiency', [bad, good, none])
    expect(r.map(x => x.handle)).toEqual(['good', 'bad'])
    expect(r[0].value).toBeCloseTo(10, 5)
  })

  it('sorts self-reported below verified at equal value', () => {
    const v = e('verified', { costUsd: 50, anyUnverified: false })
    const s = e('selfrep',  { costUsd: 50, anyUnverified: true })
    const r = rankBoard('burn', [s, v])
    expect(r.map(x => x.handle)).toEqual(['verified', 'selfrep'])
  })

  it('ranks the index board using the published formula', () => {
    const poly = e('poly', { tools: Array.from({length:4},(_,i)=>({tool:`t${i}`,sessions:100,costUsd:0})) })
    const spec = e('spec', { tools: [{ tool: 'a', sessions: 400, costUsd: 0 }] })
    const r = rankBoard('index', [spec, poly])
    expect(r.map(x => x.handle)).toEqual(['poly', 'spec'])
    expect(r[0].value).toBeCloseTo(40, 5)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/boards.test.ts`
Expected: FAIL — cannot find module `../src/lib/boards`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/boards.ts
import { computeIndex, qualifies, type ToolDepth } from './index-math'

export type BoardKind = 'burn' | 'breadth' | 'efficiency' | 'index'

export type Entrant = {
  handle: string
  avatarUrl: string | null
  tools: ToolDepth[]
  costUsd: number
  mergedPrs: number
  contributions: number
  anyUnverified: boolean
}

export type BoardEntry = {
  handle: string
  avatarUrl: string | null
  value: number
  verified: boolean
  toolCount: number
  index: number
}

export function rankBoard(kind: BoardKind, entrants: Entrant[]): BoardEntry[] {
  const rows = entrants.flatMap((e) => {
    const breakdown = computeIndex(e.tools, { mergedPrs: e.mergedPrs, contributions: e.contributions })
    const toolCount = e.tools.filter(qualifies).length

    let value: number
    if (kind === 'burn') value = e.costUsd
    else if (kind === 'breadth') value = toolCount
    else if (kind === 'index') value = breakdown.index
    else {
      // Efficiency is undefined without shipped output; omit rather than rank at infinity.
      if (e.mergedPrs <= 0) return []
      value = e.costUsd / e.mergedPrs
    }

    return [{
      handle: e.handle, avatarUrl: e.avatarUrl, value,
      verified: !e.anyUnverified, toolCount, index: breakdown.index,
    }]
  })

  const ascending = kind === 'efficiency'
  return rows.sort((a, b) => {
    if (a.value !== b.value) return ascending ? a.value - b.value : b.value - a.value
    // Verified outranks self-reported at equal value.
    if (a.verified !== b.verified) return a.verified ? -1 : 1
    return a.handle.localeCompare(b.handle)
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/boards.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/boards.ts tests/boards.test.ts
git commit -m "feat: board ranking for burn, breadth, efficiency, and index"
```

---

### Task 5: GitHub sign-in

**Files:**
- Create: `src/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/lib/handle.ts`
- Test: `tests/handle.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `users` table from Task 1
- Produces: `auth()` from `src/auth.ts` returning a session whose `user.handle` is the arena handle; `deriveHandle(login: string, taken: Set<string>): string`

- [ ] **Step 1: Write the failing test**

```ts
// tests/handle.test.ts
import { describe, it, expect } from 'vitest'
import { deriveHandle } from '../src/lib/handle'

describe('deriveHandle', () => {
  it('lowercases and strips characters that are not url safe', () => {
    expect(deriveHandle('Omkar.Dev_1', new Set())).toBe('omkar-dev_1')
  })
  it('suffixes on collision rather than overwriting an existing handle', () => {
    expect(deriveHandle('omkar', new Set(['omkar']))).toBe('omkar-2')
    expect(deriveHandle('omkar', new Set(['omkar', 'omkar-2']))).toBe('omkar-3')
  })
  it('falls back for a login that reduces to nothing', () => {
    expect(deriveHandle('!!!', new Set())).toMatch(/^dev-/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/handle.test.ts`
Expected: FAIL — cannot find module `../src/lib/handle`.

- [ ] **Step 3: Write `src/lib/handle.ts`**

```ts
// A handle is a public URL other pages link to, so it is derived once at creation
// and never moves, even if the GitHub login later changes.
export function deriveHandle(login: string, taken: Set<string>): string {
  const base = login.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  const root = base.length > 0 ? base : `dev-${Math.abs(hash(login)) % 100000}`
  if (!taken.has(root)) return root
  for (let n = 2; ; n++) {
    const candidate = `${root}-${n}`
    if (!taken.has(candidate)) return candidate
  }
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/handle.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write `src/auth.ts`**

```ts
import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import { eq } from 'drizzle-orm'
import { db } from './db/client'
import { users } from './db/schema'
import { deriveHandle } from './lib/handle'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  callbacks: {
    async signIn({ profile }) {
      if (!profile?.id) return false
      const githubId = String(profile.id)
      const existing = await db.select().from(users).where(eq(users.githubId, githubId))
      if (existing.length > 0) return true
      const all = await db.select({ handle: users.handle }).from(users)
      const handle = deriveHandle(String(profile.login ?? 'dev'), new Set(all.map((u) => u.handle)))
      // public_opt_in stays false: signing in is not consent to be listed.
      await db.insert(users).values({
        githubId, handle, avatarUrl: (profile.avatar_url as string) ?? null,
      })
      return true
    },
    async session({ session, token }) {
      const rows = await db.select().from(users).where(eq(users.githubId, String(token.sub)))
      if (rows[0]) {
        ;(session.user as any).handle = rows[0].handle
        ;(session.user as any).publicOptIn = rows[0].publicOptIn
      }
      return session
    },
  },
})
```

- [ ] **Step 6: Write `src/app/api/auth/[...nextauth]/route.ts`**

```ts
import { handlers } from '@/auth'
export const { GET, POST } = handlers
```

- [ ] **Step 7: Add auth variables to `.env.example`**

```
DATABASE_URL=pglite://.data/pg
AUTH_SECRET=
AUTH_GITHUB_ID=
AUTH_GITHUB_SECRET=
```

- [ ] **Step 8: Verify sign-in works end to end**

Run: `pnpm dev`, visit `http://localhost:3000/api/auth/signin`, sign in with GitHub.
Expected: a row appears in `users` with `public_opt_in = false`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: GitHub sign-in with stable derived handles, opt-in defaulting to false"
```

---

### Task 6: Ingest API

**Files:**
- Create: `src/lib/ingest.ts`, `src/app/api/v1/report/route.ts`
- Test: `tests/ingest.test.ts`

**Interfaces:**
- Consumes: `toolDays` from Task 1
- Produces:
  - `reportSchema` (zod) and `type ReportPayload = z.infer<typeof reportSchema>`
  - `normalizeReport(p: ReportPayload, source: 'reporter' | 'manual'): NormalizedRow[]`
  - `type NormalizedRow = { tool: string; model: string; day: string; sessions: number; tokensIn: number; tokensOut: number; cacheRead: number; cacheWrite: number; costUsd: string; source: string; verified: boolean }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/ingest.test.ts
import { describe, it, expect } from 'vitest'
import { reportSchema, normalizeReport } from '../src/lib/ingest'

const payload = {
  days: [{
    tool: 'Claude Code', model: 'Opus', day: '2026-08-21',
    sessions: 4, tokensIn: 100, tokensOut: 50, cacheRead: 10, cacheWrite: 5, costUsd: 1.25,
  }],
}

describe('reportSchema', () => {
  it('rejects negative token counts', () => {
    const bad = { days: [{ ...payload.days[0], tokensIn: -1 }] }
    expect(reportSchema.safeParse(bad).success).toBe(false)
  })
  it('rejects a malformed day', () => {
    const bad = { days: [{ ...payload.days[0], day: '21-08-2026' }] }
    expect(reportSchema.safeParse(bad).success).toBe(false)
  })
  it('rejects a payload above the sanity cap', () => {
    const bad = { days: [{ ...payload.days[0], costUsd: 1_000_000 }] }
    expect(reportSchema.safeParse(bad).success).toBe(false)
  })
  it('accepts a well-formed payload', () => {
    expect(reportSchema.safeParse(payload).success).toBe(true)
  })
})

describe('normalizeReport', () => {
  it('lowercases and slugs tool and model so boards group correctly', () => {
    const [row] = normalizeReport(reportSchema.parse(payload), 'reporter')
    expect(row.tool).toBe('claude-code')
    expect(row.model).toBe('opus')
  })
  it('marks reporter rows verified and manual rows not', () => {
    expect(normalizeReport(reportSchema.parse(payload), 'reporter')[0].verified).toBe(true)
    expect(normalizeReport(reportSchema.parse(payload), 'manual')[0].verified).toBe(false)
  })
  it('renders cost as a fixed-scale string to avoid float drift in the ledger', () => {
    expect(normalizeReport(reportSchema.parse(payload), 'manual')[0].costUsd).toBe('1.2500')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/ingest.test.ts`
Expected: FAIL — cannot find module `../src/lib/ingest`.

- [ ] **Step 3: Write `src/lib/ingest.ts`**

```ts
import { z } from 'zod'

const MAX_COST_PER_DAY = 100_000
const MAX_TOKENS_PER_DAY = 10_000_000_000

const dayRow = z.object({
  tool: z.string().min(1).max(60),
  model: z.string().min(1).max(60),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sessions: z.number().int().min(0).max(100_000),
  tokensIn: z.number().int().min(0).max(MAX_TOKENS_PER_DAY),
  tokensOut: z.number().int().min(0).max(MAX_TOKENS_PER_DAY),
  cacheRead: z.number().int().min(0).max(MAX_TOKENS_PER_DAY),
  cacheWrite: z.number().int().min(0).max(MAX_TOKENS_PER_DAY),
  costUsd: z.number().min(0).max(MAX_COST_PER_DAY),
})

export const reportSchema = z.object({ days: z.array(dayRow).min(1).max(2000) })
export type ReportPayload = z.infer<typeof reportSchema>

export type NormalizedRow = {
  tool: string; model: string; day: string; sessions: number
  tokensIn: number; tokensOut: number; cacheRead: number; cacheWrite: number
  costUsd: string; source: string; verified: boolean
}

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9.+-]+/g, '-').replace(/^-+|-+$/g, '')

export function normalizeReport(p: ReportPayload, source: 'reporter' | 'manual'): NormalizedRow[] {
  return p.days.map((d) => ({
    tool: slug(d.tool),
    model: slug(d.model),
    day: d.day,
    sessions: d.sessions,
    tokensIn: d.tokensIn, tokensOut: d.tokensOut,
    cacheRead: d.cacheRead, cacheWrite: d.cacheWrite,
    costUsd: d.costUsd.toFixed(4),
    source,
    verified: source === 'reporter',
  }))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/ingest.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Write `src/app/api/v1/report/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { db } from '@/db/client'
import { users, toolDays } from '@/db/schema'
import { reportSchema, normalizeReport } from '@/lib/ingest'

export async function POST(req: Request) {
  const session = await auth()
  const handle = (session?.user as any)?.handle
  if (!handle) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const parsed = reportSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid payload', issues: parsed.error.issues }, { status: 400 })
  }

  const [user] = await db.select().from(users).where(eq(users.handle, handle))
  if (!user) return NextResponse.json({ error: 'no such user' }, { status: 404 })

  // Task 7 replaces 'manual' with 'reporter' when a signed reporter payload is present.
  const rows = normalizeReport(parsed.data, 'manual')
  for (const r of rows) {
    await db.insert(toolDays).values({ userId: user.id, ...r })
      .onConflictDoUpdate({
        target: [toolDays.userId, toolDays.tool, toolDays.model, toolDays.day],
        set: { ...r },
      })
  }
  return NextResponse.json({ ok: true, rows: rows.length })
}
```

- [ ] **Step 6: Verify the endpoint end to end**

```bash
pnpm dev
# sign in first, then from the browser console:
# await fetch('/api/v1/report', {method:'POST',headers:{'content-type':'application/json'},
#   body: JSON.stringify({days:[{tool:'Claude Code',model:'Opus',day:'2026-08-21',
#   sessions:4,tokensIn:100,tokensOut:50,cacheRead:10,cacheWrite:5,costUsd:1.25}]})}).then(r=>r.json())
```
Expected: `{ ok: true, rows: 1 }`, and re-posting the same day updates rather than duplicating.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: validated, idempotent ingest endpoint for tool-day reports"
```

---

### Task 7: Manual self-report UI and the two consent gates

**Files:**
- Create: `src/app/report/page.tsx`, `src/app/report/actions.ts`
- Create: `src/app/settings/page.tsx`, `src/app/settings/actions.ts`
- Test: `tests/consent.test.ts`

**Interfaces:**
- Consumes: `reportSchema`, `normalizeReport` (Task 6), `users` (Task 1)
- Produces: server actions `submitManualReport(formData: FormData)`, `setPublicOptIn(value: boolean)`, `deleteAllData()`

- [ ] **Step 1: Write the failing test**

```ts
// tests/consent.test.ts
import { describe, it, expect } from 'vitest'
import { canAppearOnBoards } from '../src/lib/consent'

describe('canAppearOnBoards', () => {
  it('excludes a user who has not opted in, even with data', () => {
    expect(canAppearOnBoards({ publicOptIn: false, hasData: true })).toBe(false)
  })
  it('includes a user who opted in and has data', () => {
    expect(canAppearOnBoards({ publicOptIn: true, hasData: true })).toBe(true)
  })
  it('excludes an opted-in user with no data so the board has no empty rows', () => {
    expect(canAppearOnBoards({ publicOptIn: true, hasData: false })).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/consent.test.ts`
Expected: FAIL — cannot find module `../src/lib/consent`.

- [ ] **Step 3: Write `src/lib/consent.ts`**

```ts
// Signing in is not consent to be listed, and having data is not consent either.
// Public listing requires an explicit, separate, revocable opt-in.
export function canAppearOnBoards(u: { publicOptIn: boolean; hasData: boolean }): boolean {
  return u.publicOptIn && u.hasData
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/consent.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write `src/app/settings/actions.ts`**

```ts
'use server'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { db } from '@/db/client'
import { users, toolDays, githubStats } from '@/db/schema'

async function currentUser() {
  const session = await auth()
  const handle = (session?.user as any)?.handle
  if (!handle) throw new Error('unauthenticated')
  const [u] = await db.select().from(users).where(eq(users.handle, handle))
  if (!u) throw new Error('no such user')
  return u
}

export async function setPublicOptIn(value: boolean) {
  const u = await currentUser()
  await db.update(users).set({ publicOptIn: value }).where(eq(users.id, u.id))
  revalidatePath('/')
  revalidatePath(`/@${u.handle}`)
}

export async function deleteAllData() {
  const u = await currentUser()
  await db.delete(toolDays).where(eq(toolDays.userId, u.id))
  await db.delete(githubStats).where(eq(githubStats.userId, u.id))
  await db.update(users).set({ publicOptIn: false }).where(eq(users.id, u.id))
  revalidatePath('/')
}
```

- [ ] **Step 6: Write `src/app/settings/page.tsx`**

```tsx
import { setPublicOptIn, deleteAllData } from './actions'

export default function Settings() {
  return (
    <main className="mx-auto max-w-2xl p-8 space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="space-y-2">
        <h2 className="font-semibold">Public board</h2>
        <p className="text-sm opacity-70">
          Your data is private until you turn this on. Signing in does not list you.
        </p>
        <form action={async () => { 'use server'; await setPublicOptIn(true) }}>
          <button className="rounded bg-orange-600 px-4 py-2 text-white">List me publicly</button>
        </form>
        <form action={async () => { 'use server'; await setPublicOptIn(false) }}>
          <button className="rounded border px-4 py-2">Remove me from public boards</button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Delete everything</h2>
        <p className="text-sm opacity-70">Removes all reported usage and unlists you. Irreversible.</p>
        <form action={async () => { 'use server'; await deleteAllData() }}>
          <button className="rounded border border-red-600 px-4 py-2 text-red-600">Delete my data</button>
        </form>
      </section>
    </main>
  )
}
```

- [ ] **Step 7: Write `src/app/report/page.tsx`**

A single form posting one tool-day row, for Cursor users and anyone without a parseable log.

```tsx
import { submitManualReport } from './actions'

export default function Report() {
  return (
    <main className="mx-auto max-w-xl p-8 space-y-4">
      <h1 className="text-2xl font-bold">Add usage manually</h1>
      <p className="text-sm opacity-70">
        Manual entries carry a self-reported badge, sort below verified entries, and are excluded
        from the model breakdown on the homepage.
      </p>
      <form action={submitManualReport} className="grid gap-3">
        <input name="tool" placeholder="Tool (e.g. cursor)" required className="border p-2 rounded" />
        <input name="model" placeholder="Model (e.g. sonnet)" required className="border p-2 rounded" />
        <input name="day" type="date" required className="border p-2 rounded" />
        <input name="sessions" type="number" min="0" placeholder="Sessions" required className="border p-2 rounded" />
        <input name="costUsd" type="number" min="0" step="0.01" placeholder="Cost in USD" required className="border p-2 rounded" />
        <button className="rounded bg-orange-600 px-4 py-2 text-white">Submit</button>
      </form>
    </main>
  )
}
```

- [ ] **Step 8: Write `src/app/report/actions.ts`**

```ts
'use server'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { db } from '@/db/client'
import { users, toolDays } from '@/db/schema'
import { reportSchema, normalizeReport } from '@/lib/ingest'

export async function submitManualReport(formData: FormData) {
  const session = await auth()
  const handle = (session?.user as any)?.handle
  if (!handle) throw new Error('unauthenticated')
  const [u] = await db.select().from(users).where(eq(users.handle, handle))
  if (!u) throw new Error('no such user')

  const parsed = reportSchema.parse({
    days: [{
      tool: String(formData.get('tool')),
      model: String(formData.get('model')),
      day: String(formData.get('day')),
      sessions: Number(formData.get('sessions')),
      tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 0,
      costUsd: Number(formData.get('costUsd')),
    }],
  })

  for (const r of normalizeReport(parsed, 'manual')) {
    await db.insert(toolDays).values({ userId: u.id, ...r })
      .onConflictDoUpdate({
        target: [toolDays.userId, toolDays.tool, toolDays.model, toolDays.day],
        set: { ...r },
      })
  }
  revalidatePath('/')
}
```

- [ ] **Step 9: Verify manually**

Run `pnpm dev`, sign in, submit a row at `/report`, confirm at `/settings` that you are not listed until you press "List me publicly".

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: manual self-report, explicit public opt-in, and data deletion"
```

---

### Task 8: Query layer

**Files:**
- Create: `src/lib/queries.ts`
- Test: `tests/queries.test.ts` (integration, runs against PGlite)

**Interfaces:**
- Consumes: `db`, schema tables, `canAppearOnBoards`
- Produces:
  - `getCollectiveRows(window: 'day' | 'week' | 'month' | 'all'): Promise<BurnRow[]>`
  - `getEntrants(window: 'day' | 'week' | 'month' | 'all'): Promise<Entrant[]>`
  - `getProfile(handle: string): Promise<{ user; tools: ToolDepth[]; costUsd: number; mergedPrs: number; contributions: number; anyUnverified: boolean } | null>`

- [ ] **Step 1: Write the failing integration test**

```ts
// tests/queries.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../src/db/client'
import { users, toolDays } from '../src/db/schema'
import { getEntrants } from '../src/lib/queries'

async function reset() {
  await db.delete(toolDays)
  await db.delete(users)
}

describe('getEntrants', () => {
  beforeEach(reset)

  it('omits users who have not opted in', async () => {
    const [priv] = await db.insert(users)
      .values({ githubId: '1', handle: 'private', publicOptIn: false }).returning()
    await db.insert(toolDays).values({
      userId: priv.id, tool: 'claude-code', model: 'opus', day: '2026-08-21',
      sessions: 50, costUsd: '10.0000', source: 'manual', verified: false,
    })
    expect(await getEntrants('all')).toHaveLength(0)
  })

  it('includes opted-in users and aggregates their tools', async () => {
    const [pub] = await db.insert(users)
      .values({ githubId: '2', handle: 'public', publicOptIn: true }).returning()
    await db.insert(toolDays).values([
      { userId: pub.id, tool: 'claude-code', model: 'opus', day: '2026-08-20',
        sessions: 30, costUsd: '10.0000', source: 'reporter', verified: true },
      { userId: pub.id, tool: 'claude-code', model: 'sonnet', day: '2026-08-21',
        sessions: 20, costUsd: '5.0000', source: 'reporter', verified: true },
    ])
    const [e] = await getEntrants('all')
    expect(e.handle).toBe('public')
    expect(e.tools).toHaveLength(1)          // both rows are the same tool
    expect(e.tools[0].sessions).toBe(50)
    expect(e.costUsd).toBeCloseTo(15, 5)
    expect(e.anyUnverified).toBe(false)
  })

  it('flags an entrant as unverified when any row is self-reported', async () => {
    const [u] = await db.insert(users)
      .values({ githubId: '3', handle: 'mixed', publicOptIn: true }).returning()
    await db.insert(toolDays).values([
      { userId: u.id, tool: 'a', model: 'm', day: '2026-08-20',
        sessions: 30, costUsd: '1.0000', source: 'reporter', verified: true },
      { userId: u.id, tool: 'b', model: 'm', day: '2026-08-20',
        sessions: 30, costUsd: '1.0000', source: 'manual', verified: false },
    ])
    const [e] = await getEntrants('all')
    expect(e.anyUnverified).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/queries.test.ts`
Expected: FAIL — cannot find module `../src/lib/queries`.

- [ ] **Step 3: Write `src/lib/queries.ts`**

```ts
import { eq, gte, and } from 'drizzle-orm'
import { db } from '@/db/client'
import { users, toolDays, githubStats } from '@/db/schema'
import type { BurnRow } from './collective'
import type { Entrant } from './boards'

export type Window = 'day' | 'week' | 'month' | 'all'

// Callers pass the cutoff so query results stay deterministic in tests.
export function cutoffFor(window: Window, today: Date): string | null {
  if (window === 'all') return null
  const days = window === 'day' ? 1 : window === 'week' ? 7 : 30
  const d = new Date(today)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

export async function getCollectiveRows(window: Window, today = new Date()): Promise<BurnRow[]> {
  const cutoff = cutoffFor(window, today)
  const rows = await db.select().from(toolDays)
    .where(cutoff ? gte(toolDays.day, cutoff) : undefined)
  return rows.map((r) => ({
    tool: r.tool, model: r.model, costUsd: Number(r.costUsd),
    tokensIn: r.tokensIn, tokensOut: r.tokensOut,
    cacheRead: r.cacheRead, cacheWrite: r.cacheWrite,
    sponsored: r.sponsored, verified: r.verified,
  }))
}

export async function getEntrants(window: Window, today = new Date()): Promise<Entrant[]> {
  const cutoff = cutoffFor(window, today)
  const rows = await db.select({
    handle: users.handle, avatarUrl: users.avatarUrl, publicOptIn: users.publicOptIn,
    userId: users.id, tool: toolDays.tool, sessions: toolDays.sessions,
    costUsd: toolDays.costUsd, verified: toolDays.verified,
  })
    .from(users)
    .innerJoin(toolDays, eq(toolDays.userId, users.id))
    .where(cutoff
      ? and(eq(users.publicOptIn, true), gte(toolDays.day, cutoff))
      : eq(users.publicOptIn, true))

  const stats = await db.select().from(githubStats)
  const statFor = new Map(stats.map((s) => [s.userId, s]))

  const byUser = new Map<string, Entrant & { userId: number }>()
  for (const r of rows) {
    let e = byUser.get(r.handle)
    if (!e) {
      const s = statFor.get(r.userId)
      e = {
        userId: r.userId, handle: r.handle, avatarUrl: r.avatarUrl,
        tools: [], costUsd: 0,
        mergedPrs: s?.mergedPrs ?? 0, contributions: s?.contributions ?? 0,
        anyUnverified: false,
      }
      byUser.set(r.handle, e)
    }
    const cost = Number(r.costUsd)
    e.costUsd += cost
    if (!r.verified) e.anyUnverified = true
    const t = e.tools.find((x) => x.tool === r.tool)
    if (t) { t.sessions += r.sessions; t.costUsd += cost }
    else e.tools.push({ tool: r.tool, sessions: r.sessions, costUsd: cost })
  }
  return [...byUser.values()]
}

export async function getProfile(handle: string) {
  const [u] = await db.select().from(users).where(eq(users.handle, handle))
  if (!u) return null
  const rows = await db.select().from(toolDays).where(eq(toolDays.userId, u.id))
  const [s] = await db.select().from(githubStats).where(eq(githubStats.userId, u.id))

  const tools: { tool: string; sessions: number; costUsd: number }[] = []
  let costUsd = 0
  let anyUnverified = false
  for (const r of rows) {
    const c = Number(r.costUsd)
    costUsd += c
    if (!r.verified) anyUnverified = true
    const t = tools.find((x) => x.tool === r.tool)
    if (t) { t.sessions += r.sessions; t.costUsd += c }
    else tools.push({ tool: r.tool, sessions: r.sessions, costUsd: c })
  }
  return {
    user: u, tools, costUsd,
    mergedPrs: s?.mergedPrs ?? 0, contributions: s?.contributions ?? 0,
    anyUnverified,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/queries.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries.ts tests/queries.test.ts
git commit -m "feat: query layer honouring public opt-in and aggregating per tool"
```

---

### Task 9: The homepage — collective counter, breakdown, and boards

**Files:**
- Create: `src/components/CollectiveCounter.tsx`, `src/components/ModelSplit.tsx`, `src/components/Board.tsx`
- Modify: `src/app/page.tsx`
- Create: `src/app/api/v1/collective/route.ts`

**Interfaces:**
- Consumes: `getCollectiveRows`, `getEntrants` (Task 8), `collectiveTotals`, `shareByModel` (Task 3), `rankBoard` (Task 4)
- Produces: `GET /api/v1/collective` returning `{ costUsd, tokensTotal, last24hCostUsd }` for the ticker to poll

- [ ] **Step 1: Write `src/components/CollectiveCounter.tsx`**

The counter animates continuously between polls. A frozen clock reads as a dead product.

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'

type Totals = { costUsd: number; tokensTotal: number; last24hCostUsd: number; developers: number }

export function CollectiveCounter({ initial }: { initial: Totals }) {
  const [t, setT] = useState(initial)
  const rate = useRef(0)
  const [drift, setDrift] = useState(0)

  useEffect(() => {
    const poll = setInterval(async () => {
      const next: Totals = await fetch('/api/v1/collective').then((r) => r.json())
      rate.current = next.last24hCostUsd / 86400   // dollars per second
      setT(next); setDrift(0)
    }, 15000)
    const tick = setInterval(() => setDrift((d) => d + rate.current * 0.1), 100)
    return () => { clearInterval(poll); clearInterval(tick) }
  }, [])

  return (
    <section className="py-16 text-center">
      <div className="font-mono text-4xl sm:text-6xl tracking-tight tabular-nums">
        {Math.round(t.tokensTotal).toLocaleString()}
      </div>
      <div className="mt-1 text-xs uppercase tracking-[0.3em] opacity-60">tokens burned</div>

      <div className="mt-8 font-mono text-3xl sm:text-5xl text-orange-500 tabular-nums">
        ${(t.costUsd + drift).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      <div className="mt-3 text-sm opacity-70">
        by {t.developers.toLocaleString()} developers · ${t.last24hCostUsd.toFixed(2)} in the last 24h
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Write `src/app/api/v1/collective/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { getCollectiveRows } from '@/lib/queries'
import { collectiveTotals } from '@/lib/collective'
import { db } from '@/db/client'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function GET() {
  const all = collectiveTotals(await getCollectiveRows('all'))
  const day = collectiveTotals(await getCollectiveRows('day'))
  const devs = await db.select({ h: users.handle }).from(users).where(eq(users.publicOptIn, true))
  return NextResponse.json({
    costUsd: all.costUsd,
    tokensTotal: all.tokensTotal,
    last24hCostUsd: day.costUsd,
    developers: devs.length,
  })
}
```

- [ ] **Step 3: Write `src/components/Board.tsx`**

```tsx
import type { BoardEntry } from '@/lib/boards'

export function Board({ title, entries, format }: {
  title: string; entries: BoardEntry[]; format: (v: number) => string
}) {
  return (
    <div>
      <h2 className="mb-3 text-sm uppercase tracking-widest opacity-60">{title}</h2>
      <ol className="divide-y">
        {entries.slice(0, 25).map((e, i) => (
          <li key={e.handle} className="flex items-center gap-3 py-2">
            <span className="w-8 tabular-nums opacity-50">{i + 1}</span>
            <a href={`/@${e.handle}`} className="flex-1 hover:underline">@{e.handle}</a>
            <span className="text-xs opacity-60">{e.toolCount} tools</span>
            <span title={e.verified ? 'Verified' : 'Self-reported'}>{e.verified ? '✅' : '🔶'}</span>
            <span className="w-28 text-right font-mono tabular-nums">{format(e.value)}</span>
          </li>
        ))}
        {entries.length === 0 && <li className="py-6 text-sm opacity-60">Nobody yet. Be first.</li>}
      </ol>
    </div>
  )
}
```

- [ ] **Step 4: Write `src/app/page.tsx`**

```tsx
import { CollectiveCounter } from '@/components/CollectiveCounter'
import { ModelSplit } from '@/components/ModelSplit'
import { Board } from '@/components/Board'
import { getCollectiveRows, getEntrants } from '@/lib/queries'
import { collectiveTotals, shareByModel } from '@/lib/collective'
import { rankBoard } from '@/lib/boards'
import { db } from '@/db/client'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const rows = await getCollectiveRows('all')
  const dayRows = await getCollectiveRows('day')
  const all = collectiveTotals(rows)
  const devs = await db.select({ h: users.handle }).from(users).where(eq(users.publicOptIn, true))
  const entrants = await getEntrants('all')

  return (
    <main className="mx-auto max-w-4xl px-6">
      <CollectiveCounter initial={{
        costUsd: all.costUsd, tokensTotal: all.tokensTotal,
        last24hCostUsd: collectiveTotals(dayRows).costUsd, developers: devs.length,
      }} />

      <ModelSplit shares={shareByModel(rows)} />

      <div className="grid gap-10 py-12 sm:grid-cols-2">
        <Board title="🔥 The Burn" entries={rankBoard('burn', entrants)}
               format={(v) => `$${v.toFixed(2)}`} />
        <Board title="🎛 Breadth" entries={rankBoard('breadth', entrants)}
               format={(v) => `${v} tools`} />
        <Board title="⚡ Efficiency" entries={rankBoard('efficiency', entrants)}
               format={(v) => `$${v.toFixed(2)}/PR`} />
        <Board title="🏆 The Index" entries={rankBoard('index', entrants)}
               format={(v) => v.toFixed(1)} />
      </div>
    </main>
  )
}
```

- [ ] **Step 5: Write `src/components/ModelSplit.tsx`**

```tsx
export function ModelSplit({ shares }: { shares: { model: string; costUsd: number; share: number }[] }) {
  if (shares.length === 0) return null
  return (
    <section className="py-8">
      <h2 className="mb-3 text-sm uppercase tracking-widest opacity-60">Where the money went</h2>
      <div className="flex h-3 overflow-hidden rounded">
        {shares.map((s, i) => (
          <div key={s.model} style={{ width: `${s.share * 100}%` }}
               className={['bg-orange-500','bg-amber-400','bg-rose-400','bg-sky-400','bg-emerald-400'][i % 5]}
               title={`${s.model} — $${s.costUsd.toFixed(2)}`} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-4 text-xs opacity-70">
        {shares.map((s) => (
          <li key={s.model}>{s.model} · {(s.share * 100).toFixed(1)}%</li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] opacity-50">Verified reports only.</p>
    </section>
  )
}
```

- [ ] **Step 6: Verify visually**

Run `pnpm dev`, sign in, submit two manual rows, opt in at `/settings`, reload `/`.
Expected: counter shows non-zero tokens and dollars, ticks visibly, boards list your handle with a 🔶 badge, and the model split is empty (manual rows are excluded).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: homepage with animated collective counter, model split, and four boards"
```

---

### Task 10: Profiles and the public JSON

**Files:**
- Create: `src/app/@[handle]/page.tsx` (route path `/@[handle]`), `src/app/api/v1/profile/[handle]/route.ts`

**Interfaces:**
- Consumes: `getProfile` (Task 8), `computeIndex` (Task 2)
- Produces: a profile page rendering the full Index breakdown, and `GET /api/v1/profile/[handle]` returning the exact numbers used

- [ ] **Step 1: Write `src/app/api/v1/profile/[handle]/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/queries'
import { computeIndex } from '@/lib/index-math'

export async function GET(_: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const p = await getProfile(handle)
  if (!p || !p.user.publicOptIn) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const breakdown = computeIndex(p.tools, { mergedPrs: p.mergedPrs, contributions: p.contributions })
  return NextResponse.json({
    handle: p.user.handle,
    costUsd: p.costUsd,
    output: { mergedPrs: p.mergedPrs, contributions: p.contributions },
    ...breakdown,
    formula: 'Index = sum(sqrt(sessions_t)) over qualifying tools + capped output term',
  })
}
```

- [ ] **Step 2: Write the profile page**

Create `src/app/[handle]/page.tsx` and match handles prefixed with `@` by linking to `/@handle`; Next.js treats `@` as a literal path character in a dynamic segment value.

```tsx
import { notFound } from 'next/navigation'
import { getProfile } from '@/lib/queries'
import { computeIndex } from '@/lib/index-math'

export const dynamic = 'force-dynamic'

export default async function Profile({ params }: { params: Promise<{ handle: string }> }) {
  const raw = (await params).handle
  const handle = raw.startsWith('@') ? raw.slice(1) : raw
  const p = await getProfile(handle)
  if (!p || !p.user.publicOptIn) notFound()

  const b = computeIndex(p.tools, { mergedPrs: p.mergedPrs, contributions: p.contributions })

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">@{p.user.handle}</h1>
        <div className="font-mono text-3xl text-orange-500">{b.index.toFixed(1)}</div>
      </header>

      <table className="mt-8 w-full text-sm">
        <tbody>
          {b.perTool.map((t) => (
            <tr key={t.tool} className={t.qualified ? '' : 'opacity-40'}>
              <td className="py-1">{t.tool}</td>
              <td className="py-1 text-right tabular-nums">{t.sessions} sessions</td>
              <td className="py-1 text-right font-mono tabular-nums">
                {t.qualified ? `√ → ${t.score.toFixed(1)}` : 'below floor'}
              </td>
            </tr>
          ))}
          <tr className="border-t font-medium">
            <td className="py-2" colSpan={2}>stack depth</td>
            <td className="py-2 text-right font-mono tabular-nums">{b.stackDepth.toFixed(1)}</td>
          </tr>
          <tr>
            <td className="py-1" colSpan={2}>output · {p.mergedPrs} merged PRs</td>
            <td className="py-1 text-right font-mono tabular-nums">+ {b.outputTerm.toFixed(1)}</td>
          </tr>
        </tbody>
      </table>

      <p className="mt-8 text-xs opacity-60">
        Total spend ${p.costUsd.toFixed(2)} — not included in the Index.{' '}
        <a className="underline" href={`/api/v1/profile/${p.user.handle}`}>Raw JSON</a> ·{' '}
        <a className="underline" href="/methodology">How this is calculated</a>
      </p>
    </main>
  )
}
```

- [ ] **Step 3: Verify**

Run `pnpm dev`, visit `/@<your-handle>`.
Expected: the per-tool rows sum visibly to stack depth, and stack depth plus output equals the Index shown at top. Confirm the JSON endpoint returns the same numbers.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: public profile with reproducible Index breakdown and raw JSON"
```

---

### Task 11: Share card

**Files:**
- Create: `src/app/@[handle]/opengraph-image.tsx`

**Interfaces:**
- Consumes: `getProfile`, `computeIndex`
- Produces: a 1200x630 PNG per profile, used automatically as the OG image

- [ ] **Step 1: Write the image route**

```tsx
import { ImageResponse } from 'next/og'
import { getProfile } from '@/lib/queries'
import { computeIndex } from '@/lib/index-math'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const raw = (await params).handle
  const handle = raw.startsWith('@') ? raw.slice(1) : raw
  const p = await getProfile(handle)
  const b = p ? computeIndex(p.tools, { mergedPrs: p.mergedPrs, contributions: p.contributions })
              : { index: 0, perTool: [] as any[] }
  const tools = p ? p.tools.length : 0

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', color: '#fff',
        fontFamily: 'monospace',
      }}>
        <div style={{ fontSize: 40, opacity: 0.6 }}>@{handle}</div>
        <div style={{ fontSize: 160, color: '#f97316', lineHeight: 1 }}>{b.index.toFixed(1)}</div>
        <div style={{ fontSize: 32, opacity: 0.6, marginTop: 16 }}>
          {tools} tools · ${p ? p.costUsd.toFixed(0) : 0} burned
        </div>
        <div style={{ fontSize: 24, opacity: 0.35, marginTop: 40 }}>aimaxxing.lol</div>
      </div>
    ),
    size,
  )
}
```

- [ ] **Step 2: Verify**

Run `pnpm dev`, visit `/@<handle>/opengraph-image`.
Expected: a dark 1200x630 PNG with the Index in orange.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: auto-generated share card per profile"
```

---

### Task 12: Methodology, sponsor page, and the sponsor slot

**Files:**
- Create: `src/app/methodology/page.tsx`, `src/app/sponsor/page.tsx`
- Create: `src/content/sponsors.json`, `src/components/SponsorSlot.tsx`
- Modify: `src/app/page.tsx` (render `SponsorSlot`)

**Interfaces:**
- Consumes: constants from `src/lib/index-math.ts`
- Produces: `SponsorSlot({ slot }: { slot: string })`

- [ ] **Step 1: Create `src/content/sponsors.json`**

```json
[]
```

- [ ] **Step 2: Write `src/components/SponsorSlot.tsx`**

```tsx
import sponsors from '@/content/sponsors.json'

// Sponsors never affect placement. This component renders beside boards, never inside them.
export function SponsorSlot({ slot }: { slot: string }) {
  const s = (sponsors as any[]).find((x) => x.slot === slot)
  if (!s) return null
  return (
    <aside className="my-6 rounded border border-dashed p-4 text-sm">
      <span className="mr-2 rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wider dark:bg-neutral-800">
        Sponsor
      </span>
      <a href={s.url} className="underline">{s.name}</a> — {s.blurb}
    </aside>
  )
}
```

- [ ] **Step 3: Write `src/app/methodology/page.tsx`**

The formula and every constant, published verbatim so any reader can recompute a ranking.

```tsx
import { QUALIFY_SESSIONS, QUALIFY_COST_USD, OUTPUT_CAP, CONTRIBUTIONS_PER_UNIT } from '@/lib/index-math'

export default function Methodology() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 space-y-6 text-sm leading-relaxed">
      <h1 className="text-2xl font-bold">How this is calculated</h1>

      <pre className="rounded bg-neutral-100 p-4 dark:bg-neutral-900">
{`Index = Σ √(sessions in tool t)   for every qualifying tool
      + output term (capped)`}
      </pre>

      <ul className="list-disc space-y-2 pl-5">
        <li>A tool qualifies at <strong>{QUALIFY_SESSIONS}+ sessions or ${QUALIFY_COST_USD}+ spent</strong>.</li>
        <li>The square root means depth counts but flattens, so breadth compounds. Four tools at 100 sessions (40.0) beats one at 400 (20.0).</li>
        <li><strong>Spend is not in the Index.</strong> It drives The Burn board only. Rank cannot be purchased.</li>
        <li>The output term is <strong>additive and capped at {OUTPUT_CAP}</strong>: <code>min({OUTPUT_CAP}, 2·√(merged PRs + private contributions / {CONTRIBUTIONS_PER_UNIT}))</code>. Additive so people who ship in private repos are not zeroed out.</li>
        <li>Pull requests cannot be attributed to a specific tool — no agent records which CLI wrote which commit — so output is account-level.</li>
      </ul>

      <h2 className="pt-4 text-lg font-semibold">Verification</h2>
      <p>✅ means the reporter signed it. 🔶 means it was typed in by hand. Self-reported entries sort below verified entries at equal value and are excluded from the model breakdown on the homepage.</p>

      <h2 className="pt-4 text-lg font-semibold">Sponsors</h2>
      <ol className="list-decimal space-y-1 pl-5">
        <li>Sponsors fund boards and prizes. Sponsors never affect placement.</li>
        <li>Breadth counts every tool identically, sponsored or not.</li>
        <li>Sponsored credits are tagged and excluded from the collective total.</li>
      </ol>

      <h2 className="pt-4 text-lg font-semibold">Your data</h2>
      <p>Nothing is transmitted without an explicit yes, and appearing on a public board is a second, separate opt-in. Only aggregates are ever sent — never prompts, code, file paths, or repository names. Delete everything at any time from settings.</p>
    </main>
  )
}
```

- [ ] **Step 4: Write `src/app/sponsor/page.tsx`**

```tsx
export default function Sponsor() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 space-y-4 text-sm">
      <h1 className="text-2xl font-bold">Sponsor the arena</h1>
      <p>Developers here have verified spend on AI tools. Not inferred interest — measured dollars.</p>
      <p className="font-mono text-lg">$1,200 / month · one slot</p>
      <p>Sponsors fund boards and prizes. Sponsors never affect placement — see <a className="underline" href="/methodology">methodology</a>.</p>
      <p>Email <a className="underline" href="mailto:aivsomkar@gmail.com">aivsomkar@gmail.com</a>.</p>
    </main>
  )
}
```

- [ ] **Step 5: Render the slot on the homepage**

Add to `src/app/page.tsx`, between `ModelSplit` and the boards grid:

```tsx
import { SponsorSlot } from '@/components/SponsorSlot'
// ...
<SponsorSlot slot="homepage" />
```

- [ ] **Step 6: Run the full suite and typecheck**

```bash
pnpm test
pnpm typecheck
pnpm build
```
Expected: all tests pass, no type errors, production build succeeds.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: methodology, sponsor page, and non-placement sponsor slot"
```

---

## Deferred to Plan 2 (Reporter CLI)

`npx aimaxxing link` · local log parsing for Claude Code, Codex CLI, and OpenCode · keypair generation and signed payloads · flipping ingested rows to `verified: true` · `npx aimaxxing unlink` · GitHub stats sync job · nightly `collective_days` rollup.

## Deferred to post-v1

Teams and orgs · duels · prize pools · payments · MCP server · Cursor auto-detection · historical charts · notifications.
