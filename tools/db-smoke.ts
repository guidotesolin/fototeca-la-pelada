/**
 * Smoke test for the schema: inserts a photo with two translations, reads it
 * back, and checks the things that are easy to get silently wrong -- the trigger
 * that fills `search_vector`, whether it picks the right configuration per
 * language, accent-insensitive search, and the cascade deletes the takedown flow
 * depends on. Leaves the database exactly as it found it.
 *
 *   npm run db:smoke
 */
import assert from 'node:assert/strict'
import { and, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import {
  category,
  categoryTranslation,
  photo,
  photoCategory,
  photoTranslation,
} from '../src/db/schema'

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

// This script owns its connection and closes it, unlike the app's long-lived one.
const client = postgres(url, { max: 1, prepare: false })
const db = drizzle(client)

const CATEGORY = 'smoke-test-category'
const PHOTO = 'smoke-test-photo'

/** Deleting the photo and the category cascades to everything else. */
async function clean() {
  await db.delete(photo).where(eq(photo.slug, PHOTO))
  await db.delete(category).where(eq(category.slug, CATEGORY))
}

/** How many rows of `locale` match `query` through the accent-folding configuration. */
async function matches(locale: 'es' | 'en', query: string, config: string) {
  const rows = await db
    .select({ slug: photo.slug })
    .from(photoTranslation)
    .innerJoin(photo, eq(photo.id, photoTranslation.photoId))
    .where(
      and(
        eq(photo.slug, PHOTO),
        eq(photoTranslation.locale, locale),
        sql`${photoTranslation.searchVector} @@ websearch_to_tsquery(${config}::regconfig, ${query})`,
      ),
    )
  return rows.length
}

async function main() {
  try {
    await clean() // a previous failed run must not block this one

    const [cat] = await db
      .insert(category)
      .values({ slug: CATEGORY, position: 99, visible: false })
      .returning()
    await db.insert(categoryTranslation).values([
      {
        categoryId: cat.id,
        locale: 'es',
        name: 'Espacios',
        intro: 'Lugares que fueron escenario.',
      },
      { categoryId: cat.id, locale: 'en', name: 'Spaces', intro: 'Places that were a stage.' },
    ])

    const [ph] = await db
      .insert(photo)
      .values({
        slug: PHOTO,
        credit: 'Familia Tesolín',
        source: 'Libro del Centenario de La Pelada',
        yearFrom: 1947,
        yearTo: 1947,
        place: 'La Pelada, Santa Fe',
        masterSource: 'sites',
        masterKey: 'masters/smoke/not-a-real-key.jpg',
        masterWidth: 1024,
        masterHeight: 768,
        masterBytes: 149998,
        masterSha256: 'a'.repeat(64),
      })
      .returning()

    await db.insert(photoTranslation).values([
      {
        photoId: ph.id,
        locale: 'es',
        caption: 'Esquina de la plaza en 1947. Educación primaria al fondo.',
        notes: 'Libro del Centenario, pág. 44. Cortesía de la Familia Tesolín.',
      },
      { photoId: ph.id, locale: 'en', caption: 'Corner of the square in 1947.', notes: null },
    ])
    await db.insert(photoCategory).values({ photoId: ph.id, categoryId: cat.id, position: 1 })

    // --- reads back as one photo in two languages, with its category name ---
    const rows = await db
      .select({
        slug: photo.slug,
        credit: photo.credit,
        locale: photoTranslation.locale,
        caption: photoTranslation.caption,
        searchVector: photoTranslation.searchVector,
        categoryName: categoryTranslation.name,
      })
      .from(photo)
      .innerJoin(photoTranslation, eq(photoTranslation.photoId, photo.id))
      .innerJoin(photoCategory, eq(photoCategory.photoId, photo.id))
      .innerJoin(
        categoryTranslation,
        and(
          eq(categoryTranslation.categoryId, photoCategory.categoryId),
          eq(categoryTranslation.locale, photoTranslation.locale),
        ),
      )
      .where(eq(photo.slug, PHOTO))

    assert.equal(rows.length, 2, 'the photo reads back in its two languages')
    const es = rows.find((r) => r.locale === 'es')!
    const en = rows.find((r) => r.locale === 'en')!
    assert.equal(es.credit, 'Familia Tesolín', 'the credit is not translated')
    assert.equal(es.categoryName, 'Espacios')
    assert.equal(en.categoryName, 'Spaces')
    assert.ok(es.searchVector, 'the trigger filled search_vector on insert')

    // --- accent-insensitive, and stemmed in the right language ---
    assert.equal(
      await matches('es', 'educacion', 'es_unaccent'),
      1,
      '"educacion" finds "Educación"',
    )
    assert.equal(await matches('es', 'Tesolin', 'es_unaccent'), 1, '"Tesolin" finds "Tesolín"')
    assert.equal(
      await matches('es', 'plazas', 'es_unaccent'),
      1,
      'Spanish stemming reaches "plaza"',
    )
    assert.equal(
      await matches('es', 'inundación', 'es_unaccent'),
      0,
      'and it does not find everything',
    )
    assert.equal(
      await matches('en', 'corners', 'en_unaccent'),
      1,
      'the English row uses english_stem',
    )

    // --- an edit has to move the vector, or search goes stale ---
    await db
      .update(photoTranslation)
      .set({ caption: 'Vista del Molino "La Esmeralda".' })
      .where(and(eq(photoTranslation.photoId, ph.id), eq(photoTranslation.locale, 'es')))
    assert.equal(await matches('es', 'molino', 'es_unaccent'), 1, 'the trigger runs on update too')
    assert.equal(await matches('es', 'educacion', 'es_unaccent'), 0, 'and the old text is gone')

    // --- the takedown flow leans on these cascades ---
    await db.delete(photo).where(eq(photo.slug, PHOTO))
    const orphans = await db
      .select({ locale: photoTranslation.locale })
      .from(photoTranslation)
      .where(eq(photoTranslation.photoId, ph.id))
    assert.equal(orphans.length, 0, 'deleting a photo cascades to its translations')

    console.log('db smoke ok: 2 translations, trigger, unaccent, per-language stemming, cascades')
  } finally {
    await clean()
    await client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
