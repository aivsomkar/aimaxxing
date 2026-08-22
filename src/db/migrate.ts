import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import { PGlite } from '@electric-sql/pglite'
import { Pool } from 'pg'
import { mkdirSync } from 'node:fs'
import { normalizeDatabaseUrl } from '@/lib/database-url'

const url = normalizeDatabaseUrl(process.env.DATABASE_URL ?? 'pglite://.data/pg')

async function main() {
  if (url.startsWith('pglite://')) {
    // PGlite's Node FS backend only creates the leaf data directory, not
    // missing parents — and .data is gitignored, so it won't exist on a
    // fresh checkout.
    const dataDir = url.replace('pglite://', '')
    mkdirSync(dataDir, { recursive: true })
    const client = new PGlite(dataDir)
    const db = drizzlePglite(client)
    await migratePglite(db, { migrationsFolder: 'drizzle' })
    await client.close()
  } else {
    const pool = new Pool({ connectionString: url })
    const db = drizzle(pool)
    await migrate(db, { migrationsFolder: 'drizzle' })
    await pool.end()
  }
  console.log('Migrations applied')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
