import 'server-only'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { POSTGRES_OPTIONS } from './connect'
import * as schema from './schema'

/**
 * The application's database client. Server side only: DATABASE_URL carries no
 * NEXT_PUBLIC_ prefix, so it is never inlined into a client bundle and this
 * module throws rather than leaking anything if it is ever imported from one.
 *
 * `max: 1` and `prepare: false` are what Neon's pooled connection string wants:
 * PgBouncer in transaction mode cannot hold prepared statements, and a
 * serverless instance has no use for a pool of its own.
 *
 * Scripts must not import this — the client is never closed, so a CLI process
 * would hang on exit. They open and close their own, as `tools/db-smoke.ts` does.
 */
const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set: copy .env.example to .env.local')

export const db = drizzle(postgres(url, POSTGRES_OPTIONS), { schema })
