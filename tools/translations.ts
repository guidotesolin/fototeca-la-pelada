/**
 * The Spanish of the archive, written out as a file to translate.
 *
 * **The machine's proposals never go into the database.** They live in
 * `src/app/admin/translations/proposals/<locale>.json`, the panel offers them as
 * a starting point, and only what a person keeps and saves is stored. That is
 * what makes a non-empty caption in `photo_translation` mean *reviewed*, with no
 * column to add and no state to keep in sync -- and it is why an unreviewed
 * machine translation cannot reach the public site: there is no path.
 *
 *   npm run translations:export
 *
 * Then fill in `proposed` with whatever translator you like -- the point of a
 * file is that it is not tied to one -- and commit it. `docs/TRANSLATION.md` has
 * the rules that matter before you do, above all the terms that are not to be
 * translated at all.
 *
 * **Indexed by the source text, not by the photograph.** The archive has 519
 * captions and only 401 distinct ones, so this both saves translating 118 of them
 * twice and makes a corrected Spanish caption stop offering its old proposal on
 * its own -- the key no longer matches, which is exactly right.
 *
 * **It merges rather than overwrites**: run it again after importing photographs
 * and nothing already written is lost.
 *
 * ponytail: no translation API. Whatever produces the text is the maintainer's
 * choice and changes over time; a file is the interface that survives that, and
 * it costs the panel no dependency, no key and no network call in a write path.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { TRANSLATABLE_SITE_TEXT } from '../src/app/admin/site-text/fields'
import { POSTGRES_OPTIONS } from '../src/db/connect'
import {
  category,
  categoryTranslation,
  photoTranslation,
  siteText,
  videoTranslation,
} from '../src/db/schema'
import { defaultLocale, locales } from '../src/i18n/config'
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

const db = drizzle(postgres(url, POSTGRES_OPTIONS))
const DIR = 'src/app/admin/translations/proposals'

type Item = { source: string; proposed: string }
type File = { locale: string; items: Item[] }

/** Every distinct piece of Spanish prose in the archive that is translated. */
async function sources(): Promise<string[]> {
  const found = new Set<string>()
  const keep = (value: string | null) => {
    const text = value?.trim()
    if (text) found.add(text)
  }

  const photos = await db
    .select({ caption: photoTranslation.caption, notes: photoTranslation.notes })
    .from(photoTranslation)
    .where(eq(photoTranslation.locale, defaultLocale))
  for (const row of photos) {
    keep(row.caption)
    keep(row.notes)
  }

  const sections = await db
    .select({ name: categoryTranslation.name, intro: categoryTranslation.intro })
    .from(categoryTranslation)
    .innerJoin(category, eq(category.id, categoryTranslation.categoryId))
    .where(eq(categoryTranslation.locale, defaultLocale))
  for (const row of sections) {
    keep(row.name)
    keep(row.intro)
  }

  const videos = await db
    .select({ title: videoTranslation.title, description: videoTranslation.description })
    .from(videoTranslation)
    .where(eq(videoTranslation.locale, defaultLocale))
  for (const row of videos) {
    keep(row.title)
    keep(row.description)
  }

  const texts = await db
    .select({ key: siteText.key, value: siteText.value })
    .from(siteText)
    .where(eq(siteText.locale, defaultLocale))
  for (const row of texts) {
    // The map, the address and the three social URLs are not language.
    if (TRANSLATABLE_SITE_TEXT.includes(row.key)) keep(row.value)
  }

  // Sorted, so a re-run produces a readable diff instead of a reshuffled file.
  return [...found].sort((a, b) => a.localeCompare(b, 'es'))
}

function readExisting(path: string): Map<string, string> {
  try {
    const file = JSON.parse(readFileSync(path, 'utf8')) as File
    return new Map(file.items.map((item) => [item.source, item.proposed]))
  } catch {
    // No file yet, or one that is not readable as this shape. Either way the
    // right move is to write a fresh one rather than to stop.
    return new Map()
  }
}

async function main() {
  const all = await sources()
  console.log(`${all.length} distinct Spanish texts in the archive.`)

  for (const locale of locales) {
    if (locale === defaultLocale) continue
    const path = `${DIR}/${locale}.json`
    const existing = readExisting(path)

    const items: Item[] = all.map((source) => ({
      source,
      proposed: existing.get(source) ?? '',
    }))
    writeFileSync(path, `${JSON.stringify({ locale, items }, null, 2)}\n`)

    const filled = items.filter((item) => item.proposed.trim())
    // The check that matters before any of this is published: a protected term
    // that is in the Spanish and has gone missing from the proposal. Reported and
    // never refused -- a person decides, and the panel shows the same warning next
    // to the box where it can still be fixed.
    const suspect = filled.filter((item) => missingTerms(item.source, item.proposed).length > 0)
    const gone = existing.size - [...existing.keys()].filter((s) => all.includes(s)).length

    console.log(
      `${locale}: ${filled.length}/${items.length} proposed` +
        (suspect.length ? `, ${suspect.length} with a protected term missing` : '') +
        (gone ? `, ${gone} dropped (their Spanish changed or went away)` : ''),
    )
    for (const item of suspect) {
      console.log(
        `  ${missingTerms(item.source, item.proposed).join(', ')} — ${item.source.slice(0, 70)}…`,
      )
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
