import 'server-only'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  category,
  categoryTranslation,
  photo,
  photoTranslation,
  siteText,
  video,
  videoTranslation,
} from '@/db/schema'
import type { Locale } from '@/i18n/config'
import { Invalid } from '../invalid'
import type { Entry } from './items'

/**
 * The one place a translation is written, and the four screens that draw a box
 * all post into it.
 *
 * **Why one writer and not one per screen.** The archive has 559 translatable
 * pieces per language across three tables, and they are reachable from the
 * queue, from a photograph, from a section and from the site's own words. Four
 * write paths would be four places to get `NOT NULL` wrong, four places to
 * forget that empty means *fall back to Spanish* rather than *store nothing*,
 * and four places for a future field to be added to three of.
 *
 * **What closes F42 is that all of them still go through `outcome()`.** A
 * translation written by `psql` can take a day to show, because the public reads
 * are `unstable_cache` invalidated by `revalidateTag(GALLERY_TAG)` and a database
 * session does not call it. Every path here does, without asking: the editor is
 * the fix for the finding, and the fix is *not leaving the rail that exists*.
 *
 * The trigger on `photo_translation` fills `search_vector` with the right text
 * search configuration for the language on every insert and on every update of
 * `caption` or `notes`. Nothing here writes that column, and nothing should.
 */

/** Both `db` and a transaction satisfy this, without naming Drizzle's internals. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * The write itself, inside whatever transaction the caller already opened.
 *
 * Grouped by table because the four tables disagree about what "no translation"
 * looks like, and that disagreement is the schema's rather than this file's:
 * `photo_translation.caption` and `video_translation.title` are nullable, so an
 * empty one is a row with a null in it; `category_translation.name` and
 * `site_text.value` are `NOT NULL`, so there the only way to say "not translated"
 * is for the row not to be there.
 */
export async function writeTranslations(tx: Tx, entries: Entry[]): Promise<void> {
  if (!entries.length) return
  await writePhotos(tx, entries)
  await writeCategories(tx, entries)
  await writeVideos(tx, entries)
  await writeSiteText(tx, entries)
}

/**
 * ponytail: these four **filter** rather than switch, so a kind that no branch
 * claims is dropped in silence -- `parseItem` would accept it and nothing would
 * be written. TypeScript cannot see it, because `Array.filter` is not an
 * exhaustive match. Adding a fifth table is the moment to turn this into one
 * `switch` over `FIELDS[kind].where`.
 */

async function writePhotos(tx: Tx, entries: Entry[]): Promise<void> {
  const mine = entries.filter(
    (e) => e.target.item.kind === 'caption' || e.target.item.kind === 'notes',
  )
  if (!mine.length) return

  // The form names photographs by slug and never by row id, the way every other
  // action in the panel does.
  const slugs = [...new Set(mine.map((e) => e.target.item.id))]
  const found = await tx
    .select({ id: photo.id, slug: photo.slug })
    .from(photo)
    .where(inArray(photo.slug, slugs))
  const ids = new Map(found.map((r) => [r.slug, r.id]))
  if (ids.size !== slugs.length) throw new Invalid('no-existe')

  for (const { target, value } of mine) {
    const photoId = ids.get(target.item.id)!
    const set = target.item.kind === 'caption' ? { caption: value } : { notes: value }

    /**
     * **An empty box updates and never inserts**, and that is not a nicety: a
     * page of the queue posts all 24 of its boxes, so an upsert here wrote an
     * empty `photo_translation` row for every piece somebody scrolled past
     * without touching. Measured while cleaning up after the verification --
     * 24 rows from one save of a page where one field had been filled in, which
     * over 519 captions × 3 languages is some 1,500 rows that say nothing.
     *
     * Nothing broke: the progress screen counts non-empty fields and the public
     * read has `nullif` in front of every `coalesce`, both for the sake of
     * exactly this shape, since the Drive import already creates it. But a row
     * that means "not translated" is a row that should not be there, and an
     * `update` of a row that does not exist is a no-op, which is the whole fix.
     *
     * Clearing a translation that *does* exist still works, because then the
     * update finds its row: the field goes to null and the site falls back to
     * Spanish, which is how a bad translation comes off the site.
     */
    if (value === null) {
      await tx
        .update(photoTranslation)
        .set(set)
        .where(
          and(eq(photoTranslation.photoId, photoId), eq(photoTranslation.locale, target.locale)),
        )
      continue
    }

    // Upsert per field rather than per row: a submit may carry the caption, the
    // note, or both, and writing the pair would blank whichever one was not on
    // the form. Two upserts on the same key inside one transaction are fine --
    // the second conflicts with the first and updates its own column.
    await tx
      .insert(photoTranslation)
      .values({ photoId, locale: target.locale, ...set })
      .onConflictDoUpdate({
        target: [photoTranslation.photoId, photoTranslation.locale],
        set,
      })
  }
}

async function writeCategories(tx: Tx, entries: Entry[]): Promise<void> {
  const mine = entries.filter(
    (e) => e.target.item.kind === 'name' || e.target.item.kind === 'intro',
  )
  if (!mine.length) return

  const slugs = [...new Set(mine.map((e) => e.target.item.id))]
  const found = await tx
    .select({ id: category.id, slug: category.slug })
    .from(category)
    .where(inArray(category.slug, slugs))
  const ids = new Map(found.map((r) => [r.slug, r.id]))
  if (ids.size !== slugs.length) throw new Invalid('seccion-no-existe')

  /**
   * A section has to be handled as a pair, which the other two tables do not.
   * `name` is `NOT NULL`, so there is no row that carries an intro and no name --
   * and a submit may name only one of the two, so what is stored has to be read
   * before it can be decided. Three cases:
   *
   * - a name → upsert, and the intro goes with it if it was on the form.
   * - no name and no intro → the row goes, which is how a section is untranslated.
   * - no name but an intro → refused, exactly as `saveCategory` refuses it in
   *   Spanish. Deleting the row instead would silently take an intro somebody
   *   wrote, and that is work.
   */
  const pairs = new Map<string, { categoryId: number; locale: Locale }>()
  for (const { target } of mine) {
    pairs.set(`${target.item.id}:${target.locale}`, {
      categoryId: ids.get(target.item.id)!,
      locale: target.locale,
    })
  }

  for (const [key, { categoryId, locale }] of pairs) {
    const [stored] = await tx
      .select({ name: categoryTranslation.name, intro: categoryTranslation.intro })
      .from(categoryTranslation)
      .where(
        and(eq(categoryTranslation.categoryId, categoryId), eq(categoryTranslation.locale, locale)),
      )
      .limit(1)

    const submitted = (kind: 'name' | 'intro') =>
      mine.find(
        (e) => e.target.item.kind === kind && `${e.target.item.id}:${e.target.locale}` === key,
      )
    const nameEntry = submitted('name')
    const introEntry = submitted('intro')
    const name = nameEntry ? nameEntry.value : (stored?.name ?? null)
    const intro = introEntry ? introEntry.value : (stored?.intro ?? null)

    if (!name) {
      if (intro) throw new Invalid('nombre')
      if (stored) {
        await tx
          .delete(categoryTranslation)
          .where(
            and(
              eq(categoryTranslation.categoryId, categoryId),
              eq(categoryTranslation.locale, locale),
            ),
          )
      }
      continue
    }

    await tx
      .insert(categoryTranslation)
      .values({ categoryId, locale, name, intro })
      .onConflictDoUpdate({
        target: [categoryTranslation.categoryId, categoryTranslation.locale],
        set: { name, intro },
      })
  }
}

/**
 * The shape of `writePhotos`, not of `writeCategories`, and the difference was a
 * defect before it was a decision.
 *
 * The first version treated title and description as a pair the way a section's
 * name and intro are one, because `title` was `NOT NULL`. That refused a
 * translated description whose title had been left blank -- which is every
 * interview in this archive, since "Memorias de La Pelada -- <a name>" is a series
 * and a person and reads the same in four languages. Translating the description
 * would have meant inventing a translation of a proper noun. `title` is nullable
 * now, so each field stands on its own and falls back to Spanish by itself.
 */
async function writeVideos(tx: Tx, entries: Entry[]): Promise<void> {
  const mine = entries.filter(
    (e) => e.target.item.kind === 'title' || e.target.item.kind === 'description',
  )
  if (!mine.length) return

  const slugs = [...new Set(mine.map((e) => e.target.item.id))]
  const found = await tx
    .select({ id: video.id, slug: video.slug })
    .from(video)
    .where(inArray(video.slug, slugs))
  const ids = new Map(found.map((r) => [r.slug, r.id]))
  if (ids.size !== slugs.length) throw new Invalid('video-no-existe')

  for (const { target, value } of mine) {
    const videoId = ids.get(target.item.id)!
    const set = target.item.kind === 'title' ? { title: value } : { description: value }

    // An empty box updates and never inserts: F51's rule, and the same reason --
    // a page of the queue posts every box on it whether or not anybody typed.
    if (value === null) {
      await tx
        .update(videoTranslation)
        .set(set)
        .where(
          and(eq(videoTranslation.videoId, videoId), eq(videoTranslation.locale, target.locale)),
        )
      continue
    }

    await tx
      .insert(videoTranslation)
      .values({ videoId, locale: target.locale, ...set })
      .onConflictDoUpdate({
        target: [videoTranslation.videoId, videoTranslation.locale],
        set,
      })
  }
}

async function writeSiteText(tx: Tx, entries: Entry[]): Promise<void> {
  const mine = entries.filter((e) => e.target.item.kind === 'text')
  if (!mine.length) return

  const present = mine.flatMap(({ target, value }) =>
    value === null ? [] : [{ key: target.item.id, locale: target.locale, value }],
  )
  if (present.length) {
    await tx
      .insert(siteText)
      .values(present)
      .onConflictDoUpdate({
        target: [siteText.key, siteText.locale],
        set: { value: sql`excluded.value` },
      })
  }
  // `value` is NOT NULL, so a cleared key is a row that goes -- the same rule the
  // Spanish screen follows, and here it is also what makes the public page fall
  // back to Spanish instead of rendering an empty footer.
  for (const { target, value } of mine) {
    if (value !== null) continue
    await tx
      .delete(siteText)
      .where(and(eq(siteText.key, target.item.id), eq(siteText.locale, target.locale)))
  }
}
