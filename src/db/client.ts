import { drizzle } from 'drizzle-orm/node-postgres'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { PGlite } from '@electric-sql/pglite'
import { Pool } from 'pg'
import { mkdirSync } from 'node:fs'
import * as schema from './schema'

const url = process.env.DATABASE_URL ?? 'pglite://.data/pg'

function make() {
  if (url.startsWith('pglite://')) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('pglite:// is a local convenience and is refused in production')
    }
    // PGlite's Node FS backend only creates the leaf data directory, not
    // missing parents — and .data is gitignored, so it won't exist on a
    // fresh checkout. Create it up front so a first `pnpm dev` just works.
    const dataDir = url.replace('pglite://', '')
    mkdirSync(dataDir, { recursive: true })
    return drizzlePglite(new PGlite(dataDir), { schema })
  }
  return drizzle(new Pool({ connectionString: url }), { schema })
}

export const db = make()
export { schema }
