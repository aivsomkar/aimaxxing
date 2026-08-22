import {
  pgTable,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  date,
  numeric,
  uniqueIndex,
  serial,
  jsonb,
  uuid,
} from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  githubId: text('github_id').notNull().unique(),
  githubLogin: text('github_login'),
  handle: text('handle').notNull().unique(),
  avatarUrl: text('avatar_url'),
  publicOptIn: boolean('public_opt_in').notNull().default(false),
  // Optional, for tagging people when the weekly board is posted. Never shown
  // publicly unless the user opts in; see Task 13.
  xHandle: text('x_handle'),
  instagramHandle: text('instagram_handle'),
  tagOptIn: boolean('tag_opt_in').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const toolDays = pgTable('tool_days', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tool: text('tool').notNull(),
  model: text('model').notNull(),
  day: date('day').notNull(),
  sessions: integer('sessions').notNull().default(0),
  // bigint, not integer: int4 caps at 2,147,483,647 tokens. Cache-read counts alone
  // pass that in normal use, and the collective rollup passes it far sooner.
  tokensIn: bigint('tokens_in', { mode: 'number' }).notNull().default(0),
  tokensOut: bigint('tokens_out', { mode: 'number' }).notNull().default(0),
  cacheRead: bigint('cache_read', { mode: 'number' }).notNull().default(0),
  cacheWrite: bigint('cache_write', { mode: 'number' }).notNull().default(0),
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
  // bigint is mandatory here: this is the homepage hero counter. One day's collective
  // tokens across a few hundred developers exceeds int4.
  tokensIn: bigint('tokens_in', { mode: 'number' }).notNull().default(0),
  tokensOut: bigint('tokens_out', { mode: 'number' }).notNull().default(0),
  cacheRead: bigint('cache_read', { mode: 'number' }).notNull().default(0),
  cacheWrite: bigint('cache_write', { mode: 'number' }).notNull().default(0),
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
