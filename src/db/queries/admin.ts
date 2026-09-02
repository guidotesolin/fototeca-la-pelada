import { and, asc, eq, isNotNull, isNull, or, sql } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { db } from '@/db'
import { category, categoryTranslation, photo, photoCategory, photoTranslation } from '@/db/schema'
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
  return db
    .select({ id: category.id, slug: category.slug, name: categoryTranslation.name })
    .from(category)
    .innerJoin(
      categoryTranslation,
      and(
        eq(categoryTranslation.categoryId, category.id),
        eq(categoryTranslation.locale, SOURCE_LOCALE),
      ),
    )
    .orderBy(asc(category.position))
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
    .orderBy(asc(category.position))

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
