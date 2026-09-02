/**
 * The allowlist, from the command line. Everyone in `app_user` is an
 * administrator of the panel -- there is no role column, by design.
 *
 * This exists because of a chicken and egg: nobody can sign in while the table
 * is empty, and there is no way to add anybody from a panel nobody can enter.
 * Rather than an invitation flow for two people who sit in the same house, the
 * first rows are seeded here. It stays afterwards as the way to revoke access,
 * which no screen in the board covers either.
 *
 *   npm run admin:add -- alguien@gmail.com "Nombre Apellido"
 *   npm run admin:list
 *   npm run admin:remove -- alguien@gmail.com
 *
 * ponytail: a CLI, not a screen. Add user management to the panel when a third
 * person needs to grant access without the maintainer.
 */
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { POSTGRES_OPTIONS } from '../src/db/connect'
import { appUser } from '../src/db/schema'

try {
  process.loadEnvFile('.env.local')
} catch {
  // Fine: the variable may come from the environment instead.
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set: copy .env.example to .env.local and fill it in.')
  process.exit(1)
}

const [command, rawEmail, name] = process.argv.slice(2)

/**
 * Lowercased on the way in, because the sign-in lookup lowercases too: Google
 * returns the address in whatever case the account was typed in, and an
 * allowlist that misses on capitalisation is an outage nobody can debug.
 * The shape check is deliberately loose -- the real validation is that Google
 * has to authenticate it.
 */
const email = rawEmail?.trim().toLowerCase()
if (command !== 'list' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email ?? '')) {
  console.error(`Not an email address: ${rawEmail ?? '(none)'}`)
  process.exit(1)
}

const client = postgres(url, POSTGRES_OPTIONS)
const db = drizzle(client)

async function main() {
  switch (command) {
    case 'add': {
      // Idempotent: running it twice updates the name instead of failing on the
      // unique index, which is what a seeding script should do.
      //
      // `coalesce` rather than the new value on its own, because running this
      // with no name is how you check that somebody is still on the list, and
      // that must not cost them the name they were added with.
      const [row] = await db
        .insert(appUser)
        .values({ email: email!, name: name ?? null })
        .onConflictDoUpdate({
          target: appUser.email,
          set: { name: sql`coalesce(excluded.name, ${appUser.name})` },
        })
        .returning()
      console.log(`admin ok: ${row.email}${row.name ? ` (${row.name})` : ''}`)
      break
    }
    case 'remove': {
      const removed = await db.delete(appUser).where(eq(appUser.email, email!)).returning()
      if (removed.length === 0) {
        console.error(`not on the allowlist: ${email}`)
        process.exitCode = 1
        break
      }
      // The session cookie is a JWT and lives on, but every panel request checks
      // this table, so access is gone on the next one. See `src/lib/auth.ts`.
      console.log(`removed: ${email} -- access ends on their next request`)
      break
    }
    case 'list': {
      const rows = await db.select().from(appUser).orderBy(appUser.email)
      if (rows.length === 0) {
        console.log('the allowlist is empty: nobody can enter the panel')
        break
      }
      for (const row of rows) console.log(`${row.email}${row.name ? `\t${row.name}` : ''}`)
      console.log(`${rows.length} administrator${rows.length === 1 ? '' : 's'}`)
      break
    }
    default:
      console.error('usage: admin.ts <add|remove> <email> [name] | admin.ts list')
      process.exitCode = 1
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => client.end())
