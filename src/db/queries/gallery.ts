import { and, asc, eq, sql } from 'drizzle-orm'
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

/**
 * The public site's reads. Every one is cached and tagged, so publishing from the
 * panel can drop exactly what changed with `revalidateTag` instead of rebuilding
 * the site — which is what keeps Neon's free tier out of the request path.
 *
 * Next 16 marks `unstable_cache` as replaced by the `use cache` directive. We stay
 * on it for now: `use cache` comes with Cache Components, which is a change to how
 * the whole app renders and not a swap of one call. The migration is F19.
 */

/** A day. Publishing revalidates by tag, so this is only the floor. */
export const REVALIDATE = 86_400

export const GALLERY_TAG = 'gallery'

/** Photos per page. Twenty-four is two full screens on a phone, not twenty. */
export const PER_PAGE = 24

export const SOURCE_LOCALE = 'es' as const

export type PhotoCard = {
  slug: string
  caption: string | null
  credit: string | null
  sensitive: boolean
  webKey: string
  webWidth: number
  webHeight: number
}

/** Everything the photo's own page shows, which is the card plus the research. */
export type PhotoDetail = PhotoCard & {
  notes: string | null
  yearFrom: number | null
  yearTo: number | null
  /** An interpretation, never the document: the page opens on the original. */
  restoredWebKey: string | null
  /** Its own, not the photograph's: it is derived from its own master. */
  restoredWebWidth: number | null
  restoredWebHeight: number | null
  categories: { slug: string; name: string }[]
}

export type Section = {
  slug: string
  name: string
  intro: string | null
  photos: number
  cover: PhotoCard | null
}

const spanish = eq(photoTranslation.locale, SOURCE_LOCALE)

/**
 * The site's own words, keyed. Anything the archive says about itself comes from
 * here rather than from a component, so the panel can change it.
 */
export const listSiteText = unstable_cache(
  async (): Promise<Record<string, string>> => {
    const rows = await db
      .select({ key: siteText.key, value: siteText.value })
      .from(siteText)
      .where(eq(siteText.locale, SOURCE_LOCALE))
    return Object.fromEntries(rows.map((r) => [r.key, r.value]))
  },
  ['site-text'],
  { tags: [GALLERY_TAG], revalidate: REVALIDATE },
)

/**
 * What the archive is, in numbers, for the masthead. Queried rather than written
 * into the markup so the line stays true as the archive grows.
 */
export const archiveFacts = unstable_cache(
  async () => {
    const [row] = await db
      .select({
        photos: sql<number>`count(*)::int`,
        families: sql<number>`count(distinct ${photo.credit})::int`,
        from: sql<number>`min(${photo.yearFrom})::int`,
        to: sql<number>`max(coalesce(${photo.yearTo}, ${photo.yearFrom}))::int`,
      })
      .from(photo)
      .where(eq(photo.published, true))
    return row
  },
  ['archive-facts'],
  { tags: [GALLERY_TAG], revalidate: REVALIDATE },
)

/** Sections in the order the panel decides, hidden ones left out, each with its cover. */
export const listSections = unstable_cache(
  async (): Promise<Section[]> => {
    const rows = await db
      .select({
        slug: category.slug,
        name: categoryTranslation.name,
        intro: categoryTranslation.intro,
        coverSlug: photo.slug,
        coverKey: photo.webKey,
        coverWidth: photo.webWidth,
        coverHeight: photo.webHeight,
        coverSensitive: photo.sensitive,
        coverCaption: photoTranslation.caption,
        coverCredit: photo.credit,
      })
      .from(category)
      .innerJoin(
        categoryTranslation,
        and(
          eq(categoryTranslation.categoryId, category.id),
          eq(categoryTranslation.locale, SOURCE_LOCALE),
        ),
      )
      .leftJoin(photo, and(eq(photo.id, category.coverPhotoId), eq(photo.published, true)))
      .leftJoin(photoTranslation, and(eq(photoTranslation.photoId, photo.id), spanish))
      .where(eq(category.visible, true))
      .orderBy(asc(category.position))

    const counts = await db
      .select({ slug: category.slug, n: sql<number>`count(*)::int` })
      .from(photoCategory)
      .innerJoin(category, eq(category.id, photoCategory.categoryId))
      .innerJoin(photo, and(eq(photo.id, photoCategory.photoId), eq(photo.published, true)))
      .groupBy(category.slug)
    const byCategory = new Map(counts.map((c) => [c.slug, c.n]))

    return rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      intro: r.intro,
      photos: byCategory.get(r.slug) ?? 0,
      cover:
        r.coverKey && r.coverWidth && r.coverHeight && r.coverSlug
          ? {
              slug: r.coverSlug,
              caption: r.coverCaption,
              credit: r.coverCredit,
              sensitive: r.coverSensitive ?? false,
              webKey: r.coverKey,
              webWidth: r.coverWidth,
              webHeight: r.coverHeight,
            }
          : null,
    }))
  },
  ['sections'],
  { tags: [GALLERY_TAG], revalidate: REVALIDATE },
)

/** One section's photos, in the order its authors put them. */
export const listSectionPhotos = unstable_cache(
  async (slug: string, page: number): Promise<PhotoCard[]> => {
    const rows = await db
      .select({
        slug: photo.slug,
        caption: photoTranslation.caption,
        credit: photo.credit,
        sensitive: photo.sensitive,
        webKey: photo.webKey,
        webWidth: photo.webWidth,
        webHeight: photo.webHeight,
      })
      .from(photoCategory)
      .innerJoin(category, eq(category.id, photoCategory.categoryId))
      .innerJoin(photo, eq(photo.id, photoCategory.photoId))
      .leftJoin(photoTranslation, and(eq(photoTranslation.photoId, photo.id), spanish))
      .where(and(eq(category.slug, slug), eq(photo.published, true)))
      .orderBy(asc(photoCategory.position))
      .limit(PER_PAGE)
      .offset((page - 1) * PER_PAGE)

    // A photo with no derivatives has nothing to show; it should not exist, and if
    // it does the gallery skips it rather than rendering a broken frame.
    return rows.flatMap((r) =>
      r.webKey && r.webWidth && r.webHeight
        ? [{ ...r, webKey: r.webKey, webWidth: r.webWidth, webHeight: r.webHeight }]
        : [],
    )
  },
  ['section-photos'],
  { tags: [GALLERY_TAG], revalidate: REVALIDATE },
)

/**
 * How many photographs each section holds, published or not, for
 * `generateStaticParams` on the pagination route. Same reason as `listPhotoSlugs`
 * below: that route is `dynamicParams = false`, its params are fixed at build
 * time, and counting only the published ones means publishing the 25th photograph
 * of a section makes the gallery render a "Siguiente" link to a page that has no
 * route and answers 404 until somebody deploys.
 */
export const countSectionPhotos = unstable_cache(
  async (): Promise<Record<string, number>> => {
    const rows = await db
      .select({ slug: category.slug, n: sql<number>`count(*)::int` })
      .from(photoCategory)
      .innerJoin(category, eq(category.id, photoCategory.categoryId))
      .groupBy(category.slug)
    return Object.fromEntries(rows.map((r) => [r.slug, r.n]))
  },
  ['section-photo-counts'],
  { tags: [GALLERY_TAG], revalidate: REVALIDATE },
)

/**
 * Every photograph in the archive, for `generateStaticParams` on the detail page.
 *
 * **Every one, not only the published ones**, and the difference is a bug T10
 * measured. `generateStaticParams` runs at build time and never again, and the
 * page sets `dynamicParams = false`, so a slug missing from this list has no
 * route at all: publishing it from the panel writes the row, regenerates the
 * derivatives, reports success -- and the page keeps answering 404 until somebody
 * deploys. Listing an unpublished photograph costs one build-time render that
 * ends in `notFound()`, and buys a path that revalidation can fill the moment it
 * is published again.
 *
 * The list stays inside the archive either way, so an invented slug still costs
 * nothing: it is not a route, and nothing reaches the database for it.
 */
export const listPhotoSlugs = unstable_cache(
  async (): Promise<string[]> => {
    const rows = await db.select({ slug: photo.slug }).from(photo).orderBy(asc(photo.slug))
    return rows.map((r) => r.slug)
  },
  ['photo-slugs'],
  { tags: [GALLERY_TAG], revalidate: REVALIDATE },
)

/**
 * One photograph, with everything its own page shows. The categories come back in
 * the panel's order and only if visible, because each one is rendered as a link to
 * a gallery that a hidden section does not have.
 */
export const getPhoto = unstable_cache(
  async (slug: string): Promise<PhotoDetail | null> => {
    const rows = await db
      .select({
        slug: photo.slug,
        caption: photoTranslation.caption,
        notes: photoTranslation.notes,
        credit: photo.credit,
        yearFrom: photo.yearFrom,
        yearTo: photo.yearTo,
        sensitive: photo.sensitive,
        webKey: photo.webKey,
        webWidth: photo.webWidth,
        webHeight: photo.webHeight,
        restoredWebKey: photo.restoredWebKey,
        restoredWebWidth: photo.restoredWebWidth,
        restoredWebHeight: photo.restoredWebHeight,
        categorySlug: category.slug,
        categoryName: categoryTranslation.name,
      })
      .from(photo)
      .leftJoin(photoTranslation, and(eq(photoTranslation.photoId, photo.id), spanish))
      .leftJoin(photoCategory, eq(photoCategory.photoId, photo.id))
      .leftJoin(
        category,
        and(eq(category.id, photoCategory.categoryId), eq(category.visible, true)),
      )
      .leftJoin(
        categoryTranslation,
        and(
          eq(categoryTranslation.categoryId, category.id),
          eq(categoryTranslation.locale, SOURCE_LOCALE),
        ),
      )
      .where(and(eq(photo.slug, slug), eq(photo.published, true)))
      .orderBy(asc(category.position))

    const first = rows[0]
    // Same rule as the gallery: without derivatives there is nothing to show.
    if (!first?.webKey || !first.webWidth || !first.webHeight) return null

    return {
      ...first,
      webKey: first.webKey,
      webWidth: first.webWidth,
      webHeight: first.webHeight,
      categories: rows.flatMap((r) =>
        r.categorySlug && r.categoryName ? [{ slug: r.categorySlug, name: r.categoryName }] : [],
      ),
    }
  },
  ['photo'],
  { tags: [GALLERY_TAG], revalidate: REVALIDATE },
)

/**
 * A section's photos in curatorial order, slugs only: what the detail page needs to
 * find the one before and the one after, and to know which gallery page it came
 * from. The whole list rather than two neighbour queries, because it is cached once
 * per section instead of twice per photograph -- eleven queries for the build's 592
 * pages.
 */
export const listCategoryOrder = unstable_cache(
  async (slug: string): Promise<string[]> => {
    const rows = await db
      .select({ slug: photo.slug })
      .from(photoCategory)
      .innerJoin(category, eq(category.id, photoCategory.categoryId))
      .innerJoin(photo, and(eq(photo.id, photoCategory.photoId), eq(photo.published, true)))
      .where(eq(category.slug, slug))
      .orderBy(asc(photoCategory.position))
    return rows.map((r) => r.slug)
  },
  ['category-order'],
  { tags: [GALLERY_TAG], revalidate: REVALIDATE },
)
