import { and, asc, eq, isNotNull, isNull, or, sql } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { db } from '@/db'
import {
  category,
  categoryTranslation,
  photo,
  photoCategory,
  photoTranslation,
  siteText,
} from '@/db/schema'
import { isSectionSlug } from '@/lib/slug'
import { TRANSLATABLE_SITE_TEXT } from '@/app/admin/site-text/fields'
import { REVALIDATE, SOURCE_LOCALE } from './gallery'

/**
 * The panel's reads. Deliberately **not** cached, which is the opposite of every
 * query in `gallery.ts`: the public site is pre-rendered and revalidated by tag,
 * while this is the screen you open to find out what is actually in the database
 * right now. A day-old count of what is waiting to be published is worse than no
 * count at all.
 *
 * The one exception is `listGoneSlugs`, which is read on the public side.
 */

/**
 * The takedown list's own tag, kept apart from `GALLERY_TAG` because the two need
 * opposite revalidation profiles -- see `listGoneSlugs` and the actions.
 */
export const TAKEDOWN_TAG = 'takedown'

/** Rows per screen. Dense text rows with a thumbnail, so more than a gallery's 24. */
export const ADMIN_PER_PAGE = 48

/**
 * What the list can be narrowed to. Three of these exist because a follow-up
 * asked for them: F1 (73 photographs arrived with no caption), F3 (the twelve
 * flagged sensitive are worth one look) and F26 (nothing has a restoration yet).
 */
export const FILTERS = {
  todas: 'Todas',
  publicadas: 'Publicadas',
  'sin-publicar': 'Sin publicar',
  sensibles: 'Sensibles',
  destacadas: 'Destacadas',
  'sin-epigrafe': 'Sin epígrafe',
  restauradas: 'Con versión restaurada',
} as const

export type Filter = keyof typeof FILTERS

export function isFilter(value: unknown): value is Filter {
  return typeof value === 'string' && value in FILTERS
}

export type AdminPhotoRow = {
  id: number
  slug: string
  caption: string | null
  credit: string | null
  published: boolean
  sensitive: boolean
  featured: boolean
  restored: boolean
  thumbKey: string | null
  /** Only when the list is narrowed to one section: its curatorial order. */
  position: number | null
}

const spanish = eq(photoTranslation.locale, SOURCE_LOCALE)

/**
 * Accent-blind, because the archive is full of Tesolín, Rodríguez and Bertossi.
 *
 * `%` and `_` are escaped: they are LIKE's own wildcards, so an unescaped `100%`
 * matched every row in the archive instead of the two captions that say it.
 *
 * ponytail: `unaccent(col) ilike '%term%'` wraps the column in a function and
 * leads with a wildcard, so no index can serve it -- a sequential scan of 592
 * rows, which is nothing. The ceiling is the same one `search.ts` names for the
 * public query, a few thousand rows; past it this becomes a `search_vector` query
 * like that one.
 */
function matches(term: string) {
  const like = `%${term.replace(/[\\%_]/g, '\\$&')}%`
  return or(
    sql`unaccent(${photo.slug}) ilike unaccent(${like})`,
    sql`unaccent(coalesce(${photo.credit}, '')) ilike unaccent(${like})`,
    sql`unaccent(coalesce(${photoTranslation.caption}, '')) ilike unaccent(${like})`,
  )
}

function narrows(filter: Filter) {
  switch (filter) {
    case 'publicadas':
      return eq(photo.published, true)
    case 'sin-publicar':
      return eq(photo.published, false)
    case 'sensibles':
      return eq(photo.sensitive, true)
    case 'destacadas':
      return eq(photo.featured, true)
    case 'sin-epigrafe':
      return or(isNull(photoTranslation.caption), eq(photoTranslation.caption, ''))
    case 'restauradas':
      // Built with `or()` rather than one `sql` fragment: Drizzle parenthesizes the
      // helper's output, and a raw fragment carrying a top-level `or` escapes the
      // surrounding `and()` -- the section and the search term were being dropped.
      return or(isNotNull(photo.restoredWebKey), isNotNull(photo.restoredMasterKey))
    default:
      return undefined
  }
}

/**
 * One page of the list. Narrowed to a section it comes back in curatorial order,
 * which is what makes reordering possible; otherwise by slug, which is the
 * permanent identifier and therefore a stable order.
 */
export async function listPhotos(options: {
  q?: string
  section?: string
  filter?: Filter
  page?: number
}): Promise<{ rows: AdminPhotoRow[]; total: number }> {
  const page = Math.max(1, options.page ?? 1)
  const section = options.section?.trim()
  const term = options.q?.trim()

  const where = and(
    section ? eq(category.slug, section) : undefined,
    term ? matches(term) : undefined,
    narrows(options.filter ?? 'todas'),
  )

  const base = db
    .select({
      id: photo.id,
      slug: photo.slug,
      caption: photoTranslation.caption,
      credit: photo.credit,
      published: photo.published,
      sensitive: photo.sensitive,
      featured: photo.featured,
      restored: sql<boolean>`${photo.restoredWebKey} is not null`,
      thumbKey: photo.thumbKey,
      position: section ? photoCategory.position : sql<number | null>`null::int`,
      // One round trip: the count of the whole result set rides along on each row.
      total: sql<number>`(count(*) over ())::int`,
    })
    .from(photo)
    .leftJoin(photoTranslation, and(eq(photoTranslation.photoId, photo.id), spanish))
    .$dynamic()

  const scoped = section
    ? base
        .innerJoin(photoCategory, eq(photoCategory.photoId, photo.id))
        .innerJoin(category, eq(category.id, photoCategory.categoryId))
    : base

  /**
   * A section comes back whole, unpaginated. `position` is one ordering across the
   * section, and a form that submits only the rows on screen renumbers page two
   * over page one: 48 photographs numbered 1..48 twice, the order scrambled, and
   * the redirect showing a different page so it looks like nothing happened. The
   * largest section is 104 rows, which is a list, not a problem.
   */
  const paged = section ? undefined : { limit: ADMIN_PER_PAGE, offset: (page - 1) * ADMIN_PER_PAGE }
  const ordered = scoped
    .where(where)
    .orderBy(section ? asc(photoCategory.position) : asc(photo.slug))
  const rows = await (paged ? ordered.limit(paged.limit).offset(paged.offset) : ordered)

  return { rows, total: rows[0]?.total ?? 0 }
}

/** The sections, for the filter and for showing which ones a photograph sits in. */
export async function listCategories() {
  return (
    db
      .select({ id: category.id, slug: category.slug, name: categoryTranslation.name })
      .from(category)
      .innerJoin(
        categoryTranslation,
        and(
          eq(categoryTranslation.categoryId, category.id),
          eq(categoryTranslation.locale, SOURCE_LOCALE),
        ),
      )
      // Same tiebreak as `listSections`: `position` is not unique.
      .orderBy(asc(category.position), asc(category.slug))
  )
}

export type AdminPhoto = NonNullable<Awaited<ReturnType<typeof getPhotoForEdit>>>

/** Everything the edit screen shows, including the fields the public site never reads. */
export async function getPhotoForEdit(slug: string) {
  const [row] = await db
    .select({
      id: photo.id,
      slug: photo.slug,
      credit: photo.credit,
      source: photo.source,
      yearFrom: photo.yearFrom,
      yearTo: photo.yearTo,
      place: photo.place,
      sensitive: photo.sensitive,
      featured: photo.featured,
      published: photo.published,
      masterSource: photo.masterSource,
      masterKey: photo.masterKey,
      driveFileId: photo.driveFileId,
      masterWidth: photo.masterWidth,
      masterHeight: photo.masterHeight,
      webKey: photo.webKey,
      webWidth: photo.webWidth,
      webHeight: photo.webHeight,
      thumbKey: photo.thumbKey,
      restoredMasterKey: photo.restoredMasterKey,
      restoredWebKey: photo.restoredWebKey,
      restoredThumbKey: photo.restoredThumbKey,
      restoredMethod: photo.restoredMethod,
      restoredAt: photo.restoredAt,
      caption: photoTranslation.caption,
      notes: photoTranslation.notes,
    })
    .from(photo)
    .leftJoin(photoTranslation, and(eq(photoTranslation.photoId, photo.id), spanish))
    .where(eq(photo.slug, slug))
    .limit(1)

  if (!row) return null

  const sections = await db
    .select({ slug: category.slug, name: categoryTranslation.name })
    .from(photoCategory)
    .innerJoin(category, eq(category.id, photoCategory.categoryId))
    .innerJoin(
      categoryTranslation,
      and(
        eq(categoryTranslation.categoryId, category.id),
        eq(categoryTranslation.locale, SOURCE_LOCALE),
      ),
    )
    .where(eq(photoCategory.photoId, row.id))
    .orderBy(asc(category.position), asc(category.slug))

  return { ...row, sections }
}

/**
 * The slugs whose page must answer 410, read by `/api/gone` and from there by the
 * proxy. Cached, so an archive nobody has taken anything down from touches Neon
 * for it once.
 *
 * `TAKEDOWN_TAG` and not `GALLERY_TAG`, because this is the one read that must
 * never be served stale: it is revalidated with `{ expire: 0 }`, which the public
 * site's own pages cannot survive -- they are prerendered with
 * `dynamicParams = false`, so expiring their entry leaves nothing to serve and no
 * way to make it again. This is a route handler, which always regenerates.
 *
 * It carries **every** unpublished slug rather than only recent ones: "gone" is a
 * state, not an event, and a list that forgets would quietly turn 410 back into
 * 404 later.
 */
export const listGoneSlugs = unstable_cache(
  async (): Promise<string[]> => {
    const rows = await db
      .select({ slug: photo.slug })
      .from(photo)
      .where(eq(photo.published, false))
      .orderBy(asc(photo.slug))
    return rows.map((r) => r.slug)
  },
  ['gone-slugs'],
  { tags: [TAKEDOWN_TAG], revalidate: REVALIDATE },
)

/**
 * Every section, hidden ones included, in the order the home page lays them out.
 * `listSections()` in `gallery.ts` cannot serve this screen: it filters
 * `visible = true`, which is exactly the state this screen exists to change, and
 * it is cached for a day while this is the screen you open to see what is there
 * now.
 */
export async function listCategoriesForHome() {
  return (
    db
      .select({
        id: category.id,
        slug: category.slug,
        name: categoryTranslation.name,
        position: category.position,
        visible: category.visible,
        coverThumbKey: photo.thumbKey,
        /**
         * **Published only, because this screen is a preview of the portada** and
         * that is the figure the section's card carries there -- `listSections`
         * counts with the same join. Counting every relation row instead made the
         * panel read 27 where the site read 26 the moment one photograph was taken
         * down, on a screen whose first line says "así queda la portada".
         */
        photos: sql<number>`(
        select count(*)::int from ${photoCategory}
        join ${photo} on ${photo.id} = ${photoCategory.photoId}
        where ${photoCategory.categoryId} = ${category.id} and ${photo.published}
      )`,
        /** Stated separately, so an empty-looking section that refuses to be deleted explains itself. */
        unpublished: sql<number>`(
        select count(*)::int from ${photoCategory}
        join ${photo} on ${photo.id} = ${photoCategory.photoId}
        where ${photoCategory.categoryId} = ${category.id} and not ${photo.published}
      )`,
      })
      .from(category)
      .innerJoin(
        categoryTranslation,
        and(
          eq(categoryTranslation.categoryId, category.id),
          eq(categoryTranslation.locale, SOURCE_LOCALE),
        ),
      )
      // The cover as the home page resolves it: an unpublished one has no
      // derivatives, so it shows there as no cover and must show here the same way.
      .leftJoin(photo, and(eq(photo.id, category.coverPhotoId), eq(photo.published, true)))
      .orderBy(asc(category.position), asc(category.slug))
  )
}

export type AdminCategory = NonNullable<Awaited<ReturnType<typeof getCategoryForEdit>>>

/**
 * One section and the photographs that may represent it. The cover picker is
 * restricted to the section's own published photographs, because those are the
 * only ones the home page can actually draw: it joins on `published` and needs
 * the derivatives that a takedown deletes.
 */
export async function getCategoryForEdit(slug: string) {
  const [row] = await db
    .select({
      id: category.id,
      slug: category.slug,
      position: category.position,
      visible: category.visible,
      coverPhotoId: category.coverPhotoId,
      name: categoryTranslation.name,
      intro: categoryTranslation.intro,
    })
    .from(category)
    .innerJoin(
      categoryTranslation,
      and(
        eq(categoryTranslation.categoryId, category.id),
        eq(categoryTranslation.locale, SOURCE_LOCALE),
      ),
    )
    .where(eq(category.slug, slug))
    .limit(1)

  if (!row) return null

  const candidates = await db
    .select({
      id: photo.id,
      slug: photo.slug,
      caption: photoTranslation.caption,
      thumbKey: photo.thumbKey,
    })
    .from(photoCategory)
    .innerJoin(photo, eq(photo.id, photoCategory.photoId))
    .leftJoin(photoTranslation, and(eq(photoTranslation.photoId, photo.id), spanish))
    .where(and(eq(photoCategory.categoryId, row.id), eq(photo.published, true)))
    .orderBy(asc(photoCategory.position))

  // A photograph with no thumbnail cannot be shown in the picker, and the home
  // page could not draw it either. Narrowed here rather than asserted at the call.
  return {
    ...row,
    candidates: candidates.flatMap((c) => (c.thumbKey ? [{ ...c, thumbKey: c.thumbKey }] : [])),
  }
}

/**
 * The highlights as the panel shows them: same order as the public strip, but
 * uncached and carrying the unpublished ones too, so a photograph that is
 * flagged and invisible can be seen to be both.
 */
export async function listFeaturedForAdmin() {
  const rows = await db
    .select({
      slug: photo.slug,
      caption: photoTranslation.caption,
      thumbKey: photo.thumbKey,
      published: photo.published,
    })
    .from(photo)
    .leftJoin(photoTranslation, and(eq(photoTranslation.photoId, photo.id), spanish))
    .leftJoin(photoCategory, eq(photoCategory.photoId, photo.id))
    .leftJoin(category, and(eq(category.id, photoCategory.categoryId), eq(category.visible, true)))
    .where(eq(photo.featured, true))
    .orderBy(asc(category.position), asc(photoCategory.position), asc(photo.slug))

  // A photograph in two sections joins twice. It is one highlight either way, and
  // nothing category-dependent is selected, so which of the duplicate rows the map
  // keeps cannot matter -- see the same note on `listFeatured`.
  return [...new Map(rows.map((r) => [r.slug, r])).values()]
}

/**
 * What the Drive import already brought in, as `drive_file_id` -> `slug`. It is
 * the whole set rather than the folder's own ids: 600 short strings is nothing
 * to send, and the screen wants to say *which* photograph a file became so the
 * person can go and caption it.
 *
 * The screen uses this to show a folder as "already imported"; it is **not**
 * what makes re-importing safe. That is the partial unique index on
 * `drive_file_id`, because a read before a write is a race.
 */
export async function importedFromDrive(): Promise<Map<string, string>> {
  const rows = await db
    .select({ driveFileId: photo.driveFileId, slug: photo.slug })
    .from(photo)
    .where(isNotNull(photo.driveFileId))
  return new Map(rows.map((r) => [r.driveFileId as string, r.slug]))
}

/**
 * The identifier a newly imported photograph gets: the section's own address and
 * the next free number, zero-padded to three -- `espacios-071`.
 *
 * **The convention is T1's and it is kept on purpose.** A Drive filename is not
 * a permalink: they carry spaces, accents and repeats, and `/foto/Foto 12 (1).jpg`
 * is neither stable nor shareable. All 592 slugs in the archive are
 * `<section>-NNN` with no exceptions, so a new one that looks like the rest is
 * one less thing that has to be explained later.
 *
 * Counted over `photo.slug` and **not** over the section's membership, because a
 * photograph keeps its slug when it moves between sections: reusing a number
 * freed that way would collide with a permalink that is still out there.
 *
 * ponytail: two administrators importing into the same section at the same second
 * compute the same number, and the unique index on `slug` refuses the second. It
 * costs one retry -- the next click imports it -- which is cheaper than a
 * sequence per section. Reach for one if they ever import in parallel.
 */
export async function nextPhotoSlug(categorySlug: string): Promise<string> {
  if (!isSectionSlug(categorySlug)) throw new Error(`not a section slug: ${categorySlug}`)
  const [{ next }] = await db
    .select({
      next: sql<number>`coalesce(max(substring(${photo.slug} from '[0-9]+$')::int), 0) + 1`,
    })
    .from(photo)
    .where(sql`${photo.slug} ~ ${`^${categorySlug}-[0-9]+$`}`)
  return `${categorySlug}-${String(next).padStart(3, '0')}`
}

/** Every word of the site, for the editor. Uncached, for the same reason as the rest. */
export async function listSiteTextForEdit(): Promise<Record<string, string>> {
  const rows = await db
    .select({ key: siteText.key, value: siteText.value })
    .from(siteText)
    .where(eq(siteText.locale, SOURCE_LOCALE))
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

/**
 * What is still untranslated, per language.
 *
 * The panel's only i18n screen, and read-only: T15 loads the translations, and
 * this is what tells whoever does it where the work is. It is in Spanish like
 * every other panel screen -- _Language conventions_ keeps `next-intl` on the
 * public routes only.
 *
 * **Spanish is its own denominator**, which is why it comes back as a row like
 * the others rather than as separate totals: it is the source language, so
 * whatever exists in Spanish is exactly what there is to translate. 592 captions
 * in Spanish means 592 captions to translate, and the Spanish row reads 592/592
 * by construction.
 *
 * "Translated" means a **non-empty** field and not merely a row: the Drive import
 * creates a `photo_translation` with a null caption, and the public read path
 * treats an empty translation as absent (`nullif` before the `coalesce` in
 * `gallery.ts`). A screen that counted rows would report an imported photograph
 * as translated into Spanish it does not have.
 *
 * **And only the `site_text` keys that are language count**, which is
 * `TRANSLATABLE_SITE_TEXT` -- seven of the twelve. The other five are a map
 * embed, an email address and three social URLs, and _Anything that is not
 * language is not translated_ covers them: counting them made the screen list
 * five impossible items in each of three languages and pin the figure at 7/12
 * for ever. Caught in review.
 */
export type TranslationProgress = {
  locale: string
  captions: number
  notes: number
  names: number
  intros: number
  texts: number
  /** Small enough to name, unlike the captions: twelve keys and eleven sections. */
  missingTexts: string[]
  missingNames: string[]
}

/** Where the caption work actually is, which is the unit somebody would take on. */
export type MissingBySection = { locale: string; slug: string; missing: number }

/**
 * The translatable keys as a parameterized list. `= any(${array})` does not work:
 * Drizzle expands a JS array into `($1, $2, …)`, which Postgres reads as a record
 * and refuses to cast to `text[]`. `sql.join` says what is meant -- one bound
 * parameter per key, inside an `in`.
 */
const TRANSLATABLE_KEYS = sql.join(
  TRANSLATABLE_SITE_TEXT.map((key) => sql`${key}`),
  sql`, `,
)

export async function translationProgress(): Promise<{
  progress: TranslationProgress[]
  bySection: MissingBySection[]
}> {
  /**
   * One round trip for the summary. The subqueries all hang off the same
   * `enum_range`, so adding a fifth language to the schema puts it on this screen
   * with no code change -- which is the point of reading the enum rather than a
   * list in TypeScript.
   */
  const progress = await db.execute<TranslationProgress>(sql`
    select
      l.locale::text as locale,
      (select count(*) from photo_translation t
        where t.locale = l.locale and coalesce(t.caption, '') <> '')::int as captions,
      (select count(*) from photo_translation t
        where t.locale = l.locale and coalesce(t.notes, '') <> '')::int as notes,
      (select count(*) from category_translation ct
        where ct.locale = l.locale and coalesce(ct.name, '') <> '')::int as names,
      (select count(*) from category_translation ct
        where ct.locale = l.locale and coalesce(ct.intro, '') <> '')::int as intros,
      (select count(*) from site_text s
        where s.locale = l.locale and coalesce(s.value, '') <> ''
          and s.key in (${TRANSLATABLE_KEYS}))::int as texts,
      (select coalesce(array_agg(s.key order by s.key), '{}')
         from site_text s
        where s.locale = ${SOURCE_LOCALE}::locale
          and s.key in (${TRANSLATABLE_KEYS})
          and not exists (
            select 1 from site_text o
             where o.key = s.key and o.locale = l.locale and coalesce(o.value, '') <> ''
          )) as "missingTexts",
      (select coalesce(array_agg(c.slug order by c.position, c.slug), '{}')
         from category c
        where not exists (
          select 1 from category_translation ct
           where ct.category_id = c.id and ct.locale = l.locale
             and coalesce(ct.name, '') <> ''
        )) as "missingNames"
      from unnest(enum_range(null::locale)) as l(locale)
     order by array_position(enum_range(null::locale), l.locale)
  `)

  /**
   * A photograph in two sections is counted in both, which is right for "how much
   * is left in Campo": whoever translates the section translates it there.
   * Only photographs that have something to translate -- a Spanish caption -- are
   * counted, so the 73 that arrived with no caption at all are not reported as
   * work nobody can do.
   */
  const bySection = await db.execute<MissingBySection>(sql`
    select l.locale::text as locale, c.slug, count(*)::int as missing
      from unnest(enum_range(null::locale)) as l(locale)
      cross join photo_category pc
      join category c on c.id = pc.category_id
      join photo_translation es
        on es.photo_id = pc.photo_id and es.locale = ${SOURCE_LOCALE}::locale
     where l.locale <> ${SOURCE_LOCALE}::locale
       and coalesce(es.caption, '') <> ''
       and not exists (
         select 1 from photo_translation t
          where t.photo_id = pc.photo_id and t.locale = l.locale
            and coalesce(t.caption, '') <> ''
       )
     group by l.locale, c.slug
     order by l.locale, c.slug
  `)

  return { progress, bySection }
}
