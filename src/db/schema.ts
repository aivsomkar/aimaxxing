import { pgTable, text, integer, boolean, timestamp, date, numeric, uniqueIndex, serial } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  githubId: text('github_id').notNull().unique(),
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
