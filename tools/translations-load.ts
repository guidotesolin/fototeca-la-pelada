/**
 * Loads the reviewed proposals into the database, in bulk.
 *
 *   npm run translations:load -- --dry-run     # says what it would write
 *   npm run translations:load                  # writes it
 *   npm run translations:load -- --locale en   # one language
 *
 * **This is the door the panel deliberately does not have.** ARCHITECTURE.md used
 * to say the public site *cannot* serve an unreviewed machine translation because
 * no path existed; this file is that path, added at the maintainer's explicit
 * request, and the document now says so instead. What follows from it is worth
 * being blunt about: whatever is in the proposal files goes on the public site,
 * and the review the editor was built around is whatever happened before the file
 * was committed.
 *
 * Three things it will not do:
 *
 * - **It never overwrites.** A target that already has a non-empty value is left
 *   alone and counted as kept. The 28 pieces somebody translated by hand in the
 *   panel are not going to be replaced by a machine's version of them.
 * - **It never invents a source.** A proposal is matched by the exact Spanish
 *   text, so a caption edited since the file was generated simply has no match
 *   and is skipped rather than translated from a version that no longer exists.
 * - **It writes through the panel's own writer**, `writeTranslations`, so the
 *   limits, the `NOT NULL` rules on `category_translation.name` and
 *   `site_text.value`, and the refusal of Spanish all still hold.
 *
 * **It cannot revalidate, and that matters.** `revalidateTag` needs a Next request
 * context and there is none in a CLI, so the public pages go on serving what they
 * had -- for up to a day, which is F42 exactly. The fix is one click: save
 * anything in the panel afterwards and `outcome()` revalidates the whole tag. The
 * script says so when it finishes.
 */
import { readFileSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { TRANSLATABLE_SITE_TEXT } from '../src/app/admin/site-text/fields'
import { POSTGRES_OPTIONS } from '../src/db/connect'
import { defaultLocale, isLocale, locales, type Locale } from '../src/i18n/config'
import { missingTerms } from '../src/lib/glossary'

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

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const only = args.includes('--locale') ? args[args.indexOf('--locale') + 1] : null
if (only && (!isLocale(only) || only === defaultLocale)) {
  console.error(`--locale must be one of ${locales.filter((l) => l !== defaultLocale).join(', ')}`)
  process.exit(1)
}

const client = postgres(url, POSTGRES_OPTIONS)
const db = drizzle(client)

/** Every translatable piece, with its Spanish and what each language already has. */
type Row = { kind: string; id: string; source: string; locale: string; current: string }

async function pieces(): Promise<Row[]> {
  return db.execute<Row>(sql`
    select 'caption' as kind, p.slug as id, es.caption as source,
           l.locale::text as locale, coalesce(t.caption, '') as current
      from photo p
      join photo_translation es on es.photo_id = p.id and es.locale = 'es'
      cross join unnest(enum_range(null::locale)) as l(locale)
      left join photo_translation t on t.photo_id = p.id and t.locale = l.locale
     where coalesce(es.caption, '') <> '' and l.locale <> 'es'
    union all
    select 'notes', p.slug, es.notes, l.locale::text, coalesce(t.notes, '')
      from photo p
      join photo_translation es on es.photo_id = p.id and es.locale = 'es'
      cross join unnest(enum_range(null::locale)) as l(locale)
      left join photo_translation t on t.photo_id = p.id and t.locale = l.locale
     where coalesce(es.notes, '') <> '' and l.locale <> 'es'
    union all
    select 'name', c.slug, es.name, l.locale::text, coalesce(t.name, '')
      from category c
      join category_translation es on es.category_id = c.id and es.locale = 'es'
      cross join unnest(enum_range(null::locale)) as l(locale)
      left join category_translation t on t.category_id = c.id and t.locale = l.locale
     where l.locale <> 'es'
    union all
    select 'intro', c.slug, es.intro, l.locale::text, coalesce(t.intro, '')
      from category c
      join category_translation es on es.category_id = c.id and es.locale = 'es'
      cross join unnest(enum_range(null::locale)) as l(locale)
      left join category_translation t on t.category_id = c.id and t.locale = l.locale
     where coalesce(es.intro, '') <> '' and l.locale <> 'es'
    union all
    select 'title', v.slug, es.title, l.locale::text, coalesce(t.title, '')
      from video v
      join video_translation es on es.video_id = v.id and es.locale = 'es'
      cross join unnest(enum_range(null::locale)) as l(locale)
      left join video_translation t on t.video_id = v.id and t.locale = l.locale
     where l.locale <> 'es'
    union all
    select 'description', v.slug, es.description, l.locale::text, coalesce(t.description, '')
      from video v
      join video_translation es on es.video_id = v.id and es.locale = 'es'
      cross join unnest(enum_range(null::locale)) as l(locale)
      left join video_translation t on t.video_id = v.id and t.locale = l.locale
     where coalesce(es.description, '') <> '' and l.locale <> 'es'
    union all
    select 'text', es.key, es.value, l.locale::text, coalesce(t.value, '')
      from site_text es
      cross join unnest(enum_range(null::locale)) as l(locale)
      left join site_text t on t.key = es.key and t.locale = l.locale
     where es.locale = 'es' and l.locale <> 'es'
       and es.key in (${sql.join(
         TRANSLATABLE_SITE_TEXT.map((k) => sql`${k}`),
         sql`, `,
       )})
  `)
}

function proposalsFor(locale: Locale): Map<string, string> {
  const file = JSON.parse(
    readFileSync(`src/app/admin/translations/proposals/${locale}.json`, 'utf8'),
  ) as { items: { source: string; proposed: string }[] }
  return new Map(
    file.items.flatMap((i) => (i.proposed.trim() ? [[i.source.trim(), i.proposed] as const] : [])),
  )
}

/** Batched, because 1,677 upserts in one transaction is a long lock for no gain. */
const BATCH = 100

async function main() {
  const { readTranslations } = await import('../src/app/admin/translations/items')
  const { writeTranslations } = await import('../src/app/admin/translations/save')

  const rows = await pieces()
  const byLocale = new Map<string, Map<string, string>>()
  for (const l of locales) {
    if (l !== defaultLocale) byLocale.set(l, proposalsFor(l))
  }

  const pending: [string, string][] = []
  const stats: Record<string, { write: number; kept: number; nomatch: number; flagged: number }> =
    {}

  for (const row of rows) {
    if (only && row.locale !== only) continue
    const s = (stats[row.locale] ??= { write: 0, kept: 0, nomatch: 0, flagged: 0 })
    if (row.current.trim()) {
      s.kept += 1
      continue
    }
    const proposed = byLocale.get(row.locale)?.get(row.source.trim())
    if (!proposed) {
      s.nomatch += 1
      continue
    }
    if (missingTerms(row.source, proposed).length) s.flagged += 1
    s.write += 1
    pending.push([`${row.locale}:${row.kind}:${row.id}`, proposed])
  }

  for (const [locale, s] of Object.entries(stats)) {
    console.log(
      `${locale}: ${s.write} to write, ${s.kept} already translated (kept), ` +
        `${s.nomatch} with no matching proposal, ${s.flagged} carrying a glossary warning`,
    )
  }

  if (dryRun) {
    console.log(`\nDry run: nothing written. ${pending.length} would be.`)
    return
  }

  for (let i = 0; i < pending.length; i += BATCH) {
    const form = new FormData()
    for (const [item, value] of pending.slice(i, i + BATCH)) {
      form.append('item', item)
      form.append('value', value)
    }
    const entries = readTranslations(form)
    await db.transaction((tx) => writeTranslations(tx as never, entries))
    process.stdout.write(`\rwritten ${Math.min(i + BATCH, pending.length)}/${pending.length}`)
  }

  console.log(`\n\n${pending.length} translations written.`)
  console.log(
    'The public pages will not show them until the gallery tag is revalidated, which a\n' +
      'CLI cannot do: save anything in the panel once and `outcome()` does it for all of them.',
  )
}

main()
  .then(() => client.end())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error(error)
    await client.end()
    process.exit(1)
  })
