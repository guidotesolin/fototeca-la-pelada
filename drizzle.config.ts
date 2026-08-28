import { defineConfig } from 'drizzle-kit'

// drizzle-kit runs outside Next, so it does not get .env.local for free.
// process.loadEnvFile is stdlib since Node 20.12: no dotenv dependency needed.
try {
  process.loadEnvFile('.env.local')
} catch {
  // Fine: in CI the variable comes from the environment instead.
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  // Every DDL change is reviewed as SQL before it touches the database.
  strict: true,
  verbose: true,
})
