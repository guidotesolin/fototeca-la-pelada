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
const REVALIDATE = 86_400

export const GALLERY_TAG = 'gallery'

/** Photos per page. Twenty-four is two full screens on a phone, not twenty. */
export const PER_PAGE = 24

const SOURCE_LOCALE = 'es' as const

export type PhotoCard = {
  slug: string
  caption: string | null
  credit: string | null
  sensitive: boolean
  webKey: string
  webWidth: number
  webHeight: number
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
