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
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { Invalid } from '../src/app/admin/invalid'
import { readTranslations } from '../src/app/admin/translations/items'
import { POSTGRES_OPTIONS } from '../src/db/connect'
import {
  category,
  categoryTranslation,
  photo,
  photoCategory,
  photoTranslation,
  siteText,
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
const client = postgres(url, POSTGRES_OPTIONS)
const db = drizzle(client)

const CATEGORY = 'smoke-test-category'
/** The second section, so a photograph has somewhere to be moved to. */
const CATEGORY_B = 'smoke-test-category-b'
const PHOTO = 'smoke-test-photo'
/** Two more in the first section, so the hole a move leaves has neighbours. */
const NEIGHBOURS = ['smoke-test-photo-2', 'smoke-test-photo-3']

/**
 * A real `site_text` key, because the editor only accepts the seven that are
 * language. Production has no English row for it, and `clean()` puts that back.
 */
/**
 * A real `site_text` key, because the editor only accepts the seven that are
 * language, and there is no throwaway locale either -- all three non-Spanish
 * ones are somebody's work.
 *
 * **So this row is borrowed and put back, never merely deleted.** The first
 * version of this check deleted it in `clean()`, which was harmless while no
 * English existed and became a way to destroy a real translation the moment one
 * did. `tools/home-smoke.ts` already had the shape: read what is there before
 * touching anything, restore it in the `finally`.
 */
const SITE_KEY = 'home_title'

let checks = 0

/** Whatever was in that row before this run, restored by `clean()`. */
let borrowedSiteText: { key: string; locale: 'es' | 'en' | 'fr' | 'it'; value: string } | undefined

/** Deleting the photo and the category cascades to everything else. */
async function clean() {
  await db.delete(photo).where(inArray(photo.slug, [PHOTO, ...NEIGHBOURS]))
  await db.delete(category).where(inArray(category.slug, [CATEGORY, CATEGORY_B]))
  await db.delete(siteText).where(and(eq(siteText.key, SITE_KEY), eq(siteText.locale, 'en')))
  if (borrowedSiteText) await db.insert(siteText).values(borrowedSiteText).onConflictDoNothing()
}

async function siteTextRow() {
  const [row] = await db
    .select({ value: siteText.value })
    .from(siteText)
    .where(and(eq(siteText.key, SITE_KEY), eq(siteText.locale, 'en')))
  return row
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
  // Imported here and not at the top: these modules reach `@/db`, which builds
  // its client the moment it loads, and the static import would be hoisted above
  // `loadEnvFile` above. The same reason `search:smoke` defers its own import.
  const { writeTranslations } = await import('../src/app/admin/translations/save')
  const { writeSections } = await import('../src/app/admin/photos/sections')

  // Before anything is deleted, including by `clean()` itself.
  const [existing] = await db
    .select()
    .from(siteText)
    .where(and(eq(siteText.key, SITE_KEY), eq(siteText.locale, 'en')))
  borrowedSiteText = existing

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

    // --- the panel's write path, which is T15's ------------------------------

    /** Exactly what the four editing screens do: parse a form, write it. */
    const save = (pairs: [string, string][]) => {
      const form = new FormData()
      for (const [item, value] of pairs) {
        form.append('item', item)
        form.append('value', value)
      }
      const entries = readTranslations(form)
      return db.transaction((tx) => writeTranslations(tx as never, entries))
    }
    const captionOf = async (locale: 'en' | 'fr') => {
      const [row] = await db
        .select({ caption: photoTranslation.caption, notes: photoTranslation.notes })
        .from(photoTranslation)
        .innerJoin(photo, eq(photo.id, photoTranslation.photoId))
        .where(and(eq(photo.slug, PHOTO), eq(photoTranslation.locale, locale)))
      return row
    }

    /**
     * **An empty box must not create a row.** A page of the queue posts all 24 of
     * its boxes whether or not anybody typed in them, so an upsert here wrote an
     * empty `photo_translation` row per piece somebody scrolled past -- some 1,500
     * of them over the whole archive. Found by counting rows after the browser
     * pass rather than by reading the code, which is why it is asserted now.
     */
    await save([[`fr:caption:${PHOTO}`, '   ']])
    assert.equal(await captionOf('fr'), undefined, 'an empty box created a row')
    checks += 1

    // A real translation does create one, and the trigger stems it as French.
    await save([[`fr:caption:${PHOTO}`, 'Coin de la place en 1947.']])
    assert.equal((await captionOf('fr'))?.caption, 'Coin de la place en 1947.')
    checks += 1

    /**
     * Clearing keeps the row and nulls the field, which is how a bad translation
     * comes off the site: `coalesce(nullif(caption, ''), source.caption)` on the
     * public side then falls back to Spanish rather than leaving a hole. The note
     * beside it is not touched, because the form did not carry it.
     */
    await save([[`en:notes:${PHOTO}`, 'Centenary book, p. 44.']])
    await save([[`en:caption:${PHOTO}`, '']])
    const cleared = await captionOf('en')
    assert.equal(cleared?.caption, null, 'clearing should null the caption')
    assert.equal(cleared?.notes, 'Centenary book, p. 44.', 'clearing one field took the other')
    checks += 2

    /**
     * A section is the one that cannot express "no name": `category_translation.
     * name` is NOT NULL, so an untranslated section is a row that is not there.
     */
    await save([
      [`en:name:${CATEGORY}`, ''],
      [`en:intro:${CATEGORY}`, ''],
    ])
    const gone = await db
      .select({ name: categoryTranslation.name })
      .from(categoryTranslation)
      .innerJoin(category, eq(category.id, categoryTranslation.categoryId))
      .where(and(eq(category.slug, CATEGORY), eq(categoryTranslation.locale, 'en')))
    assert.equal(gone.length, 0, 'clearing a section translation should delete the row')
    checks += 1

    // ...and an intro with no name is refused rather than silently dropped, which
    // is the same rule `saveCategory` holds in Spanish. Work is not thrown away.
    await assert.rejects(
      () => save([[`en:intro:${CATEGORY}`, 'Places that were a stage.']]),
      (error: Error) => error instanceof Invalid && error.message === 'nombre',
      'an intro with no name should be refused',
    )
    checks += 1

    // `site_text.value` is NOT NULL too, so the same rule: written, then removed.
    await save([[`en:text:${SITE_KEY}`, 'Digital Photographic Archive of La Pelada']])
    assert.equal((await siteTextRow())?.value, 'Digital Photographic Archive of La Pelada')
    await save([[`en:text:${SITE_KEY}`, '']])
    assert.equal(await siteTextRow(), undefined, 'clearing a site text should delete the row')
    checks += 2

    // --- which sections a photograph is in (T17) ---
    // The three refusals and the position arithmetic, against a real database:
    // every one of them is invisible when it goes wrong, which is why they are
    // here rather than only in a browser pass.
    const [catB] = await db
      .insert(category)
      .values({ slug: CATEGORY_B, position: 98, visible: false })
      .returning()
    await db
      .insert(categoryTranslation)
      .values({ categoryId: catB.id, locale: 'es', name: 'Deporte' })
    /**
     * Two neighbours around the one that moves, and **around** is the point: with
     * the departing photograph first, "decrement what sat above the hole" and
     * "decrement everything" produce the same numbers, so the check cannot tell
     * them apart. It sits at 2, between 1 and 3.
     */
    const neighbours = await db
      .insert(photo)
      .values(
        NEIGHBOURS.map((slug) => ({
          slug,
          masterSource: 'sites' as const,
          masterKey: `masters/smoke/${slug}.jpg`,
          masterWidth: 1024,
          masterHeight: 768,
          masterBytes: 149998,
          masterSha256: 'b'.repeat(64),
        })),
      )
      .returning()
    await db.insert(photoCategory).values(
      neighbours.map((row, index) => ({
        photoId: row.id,
        categoryId: cat.id,
        position: index === 0 ? 1 : 3,
      })),
    )
    await db
      .update(photoCategory)
      .set({ position: 2 })
      .where(and(eq(photoCategory.photoId, ph.id), eq(photoCategory.categoryId, cat.id)))

    const sectionsOf = async (photoId: number) => {
      const rows = await db
        .select({ slug: category.slug, position: photoCategory.position })
        .from(photoCategory)
        .innerJoin(category, eq(category.id, photoCategory.categoryId))
        .where(eq(photoCategory.photoId, photoId))
        .orderBy(asc(category.slug))
      return rows
    }
    const positionsIn = async (categoryId: number) => {
      const rows = await db
        .select({ position: photoCategory.position })
        .from(photoCategory)
        .where(eq(photoCategory.categoryId, categoryId))
        .orderBy(asc(photoCategory.position))
      return rows.map((r) => r.position)
    }
    const setSections = (photoId: number, wanted: string[]) =>
      db.transaction((tx) => writeSections(tx as never, photoId, wanted))

    // Moving: out of the first section, last into the second, and the two left
    // behind close the hole -- they were 2 and 3.
    await setSections(ph.id, [CATEGORY_B])
    assert.deepEqual(await sectionsOf(ph.id), [{ slug: CATEGORY_B, position: 1 }])
    assert.deepEqual(await positionsIn(cat.id), [1, 2], 'a move must not leave a hole behind it')
    checks += 2

    // In two at once, which is the other half of what N:N promises. Back into the
    // first section it goes last, at 3.
    await setSections(ph.id, [CATEGORY, CATEGORY_B])
    assert.deepEqual(await sectionsOf(ph.id), [
      { slug: CATEGORY, position: 3 },
      { slug: CATEGORY_B, position: 1 },
    ])
    checks += 1

    // Nothing ticked: refused, because a photograph in no section is published
    // and reachable from no gallery.
    await assert.rejects(
      () => setSections(ph.id, []),
      (error: Error) => error instanceof Invalid && error.message === 'sin-seccion',
      'a photograph may not be left in no section',
    )
    // A section that is not there is refused rather than skipped.
    await assert.rejects(
      () => setSections(ph.id, [CATEGORY, 'no-such-section']),
      (error: Error) => error instanceof Invalid && error.message === 'seccion-no-existe',
      'an unknown section must be refused',
    )
    assert.equal((await sectionsOf(ph.id)).length, 2, 'a refused save must change nothing')
    checks += 3

    // A section's cover cannot be taken out of that section: the home page would
    // draw a card whose photograph is no longer in what it opens.
    await db.update(category).set({ coverPhotoId: ph.id }).where(eq(category.id, catB.id))
    await assert.rejects(
      () => setSections(ph.id, [CATEGORY]),
      (error: Error) => error instanceof Invalid && error.message === 'portada-en-uso',
      "a section's cover may not leave the section",
    )
    assert.deepEqual(
      await sectionsOf(ph.id),
      [
        { slug: CATEGORY, position: 3 },
        { slug: CATEGORY_B, position: 1 },
      ],
      'the refused removal must not have happened',
    )
    checks += 2

    /**
     * **The decrement does not assume a dense numbering**, which the comment in
     * `sections.ts` claims and which `saveOrder` can break in a single save: it
     * takes any number in the box, repeats included. Hand-numbered 3, 10, 20, and
     * the one in the middle leaves: 3 stays where it is and only 20 moves down.
     */
    await db.update(category).set({ coverPhotoId: null }).where(eq(category.id, catB.id))
    const at = (photoId: number, position: number) =>
      db
        .update(photoCategory)
        .set({ position })
        .where(and(eq(photoCategory.photoId, photoId), eq(photoCategory.categoryId, cat.id)))
    await at(ph.id, 10)
    await at(neighbours[0].id, 3)
    await at(neighbours[1].id, 20)
    await setSections(ph.id, [CATEGORY_B])
    assert.deepEqual(
      await positionsIn(cat.id),
      [3, 19],
      'a hand-numbered section keeps its order, and its gaps, when one leaves it',
    )
    checks += 1

    // Ticking exactly what is already ticked is the commonest submit there is, and
    // it writes nothing.
    const unchanged = await sectionsOf(ph.id)
    await setSections(ph.id, [CATEGORY_B])
    assert.deepEqual(await sectionsOf(ph.id), unchanged, 'saving an unchanged set changes nothing')
    assert.deepEqual(await positionsIn(cat.id), [3, 19], 'and leaves the other sections alone')
    checks += 2

    // --- the takedown flow leans on these cascades ---
    await db.delete(photo).where(eq(photo.slug, PHOTO))
    const orphans = await db
      .select({ locale: photoTranslation.locale })
      .from(photoTranslation)
      .where(eq(photoTranslation.photoId, ph.id))
    assert.equal(orphans.length, 0, 'deleting a photo cascades to its translations')

    console.log(
      `db smoke ok: 2 translations, trigger, unaccent, per-language stemming, cascades, ` +
        `and ${checks} assertions on the panel's translation and section writes`,
    )
  } finally {
    await clean()
    await client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
