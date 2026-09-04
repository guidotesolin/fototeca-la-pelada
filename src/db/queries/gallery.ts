import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { unstable_cache } from 'next/cache'
import { db } from '@/db'
import {
  category,
  categoryTranslation,
  photo,
  photoCategory,
  photoTranslation,
  siteText,
  video,
  videoTranslation,
} from '@/db/schema'
import { defaultLocale, type Locale } from '@/i18n/config'

/**
 * The public site's reads. Every one is cached and tagged, so publishing from the
 * panel can drop exactly what changed with `revalidateTag` instead of rebuilding
 * the site — which is what keeps Neon's free tier out of the request path.
 *
 * Next 16 marks `unstable_cache` as replaced by the `use cache` directive. We stay
 * on it for now: `use cache` comes with Cache Components, which is a change to how
 * the whole app renders and not a swap of one call. The migration is F19.
 *
 * ## Language
 *
 * Every read on this side takes the locale it is being read for; the panel's, in
 * `admin.ts`, does not and should not -- it writes Spanish, which is the source
 * language, and pinning it there is correct rather than an oversight.
 *
 * Two things follow, and both are load-bearing:
 *
 * - **The fallback to Spanish is in the SQL**, not in TypeScript. Each query
 *   joins the asked-for translation _and_ the Spanish one and coalesces the
 *   fields, so one round trip serves any language with no N+1 and the rule is
 *   readable where the data is read. See `CAPTION` below.
 * - **The locale is part of every cache key.** A cache entry keyed only by
 *   `['sections']` would serve whichever language happened to fill it first to
 *   every other -- an intermittent bug that shows up as English pages in Spanish
 *   and depends on the order of the first two requests after a deploy.
 *   `perLocale` is what makes that impossible to forget.
 */

/** A day. Publishing revalidates by tag, so this is only the floor. */
export const REVALIDATE = 86_400

export const GALLERY_TAG = 'gallery'

/** Photos per page. Twenty-four is two full screens on a phone, not twenty. */
export const PER_PAGE = 24

/**
 * The source language, and the one a missing translation falls back to. The same
 * value `defaultLocale` names on the routing side, under the name the schema and
 * the panel have used since T2: `admin.ts` and the panel's actions pin their
 * writes to it on purpose -- the panel writes Spanish, always -- and that is why
 * this task made the reads in this file locale-aware and left those alone.
 */
export const SOURCE_LOCALE = defaultLocale

const OPTIONS = { tags: [GALLERY_TAG], revalidate: REVALIDATE }

/** Language-independent: counts, slugs and curatorial order read no translation. */
function cached<A extends unknown[], R>(key: string, read: (...args: A) => Promise<R>) {
  return unstable_cache(read, [key], OPTIONS)
}

/**
 * One cached reader per language, with the language **in the cache key**.
 *
 * `unstable_cache` fixes its key parts when it is created, so a locale that
 * arrives as an argument can only reach the key through the closure -- which is
 * precisely the case Next's own documentation says `keyParts` exists for. Hence
 * one instance per locale, built on first use and kept: four entries per query
 * at most, and `/en` can no longer be served what `/es` cached.
 */
export function perLocale<A extends unknown[], R>(
  key: string,
  read: (locale: Locale, ...args: A) => Promise<R>,
): (locale: Locale, ...args: A) => Promise<R> {
  const byLocale = new Map<Locale, (...args: A) => Promise<R>>()

  return (locale, ...args) => {
    let entry = byLocale.get(locale)
    if (!entry) {
      entry = unstable_cache((...inner: A) => read(locale, ...inner), [key, locale], OPTIONS)
      byLocale.set(locale, entry)
    }
    return entry(...args)
  }
}

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

/**
 * One interview in the Videoteca. `poster` is a `PhotoCard` on purpose rather
 * than four loose fields: the poster is drawn by `PhotoImage` like any other
 * image in the archive, so it arrives in the shape that component already takes,
 * with the title standing in for the caption because that is what becomes the
 * `alt`.
 */
export type Video = {
  slug: string
  youtubeId: string
  title: string
  description: string | null
  poster: PhotoCard
}

/**
 * The translation rows a public query reads: the one it was asked for, and the
 * Spanish one behind it.
 *
 * Two aliases of the same table rather than one join and a second query, because
 * both are lookups on the primary key `(photo_id, locale)` -- so the fallback
 * costs an index probe per row and never a second round trip, and _Translations
 * are human work_ stays true: a partly translated archive reads as one page and
 * not as a mixture of two.
 */
export const asked = alias(photoTranslation, 'pt_asked')
export const source = alias(photoTranslation, 'pt_source')
const askedCategory = alias(categoryTranslation, 'ct_asked')
const sourceCategory = alias(categoryTranslation, 'ct_source')

/**
 * `nullif(…, '')` before the fallback, and it is not decoration: a translation
 * row can exist with nothing in it -- the Drive import creates exactly that, and
 * so will the translation editor the first time somebody saves an empty field --
 * and an empty English caption means "not translated yet", not "this photograph
 * has no caption". Without it a saved blank would blank the Spanish too.
 */
export const CAPTION = sql<string | null>`coalesce(nullif(${asked.caption}, ''), ${source.caption})`
const NOTES = sql<string | null>`coalesce(nullif(${asked.notes}, ''), ${source.notes})`
/**
 * Two types for one expression, and the difference is which join it sits under.
 * `NAME` is non-null because `listSections` **inner**-joins the Spanish row --
 * that row is what makes a section exist. `getPhoto` left-joins the category
 * itself, because a photograph may sit in none, so there the same coalesce can
 * come back null and says so: typing it `string` there would make the guard that
 * drops those rows look redundant, and the next reader would delete it.
 */
const NAME = sql<string>`coalesce(nullif(${askedCategory.name}, ''), ${sourceCategory.name})`
const OPTIONAL_NAME = sql<
  string | null
>`coalesce(nullif(${askedCategory.name}, ''), ${sourceCategory.name})`
const INTRO = sql<
  string | null
>`coalesce(nullif(${askedCategory.intro}, ''), ${sourceCategory.intro})`

/** The two `on` clauses, so no query can join one half and forget the other. */
export const onAsked = (locale: Locale) =>
  and(eq(asked.photoId, photo.id), eq(asked.locale, locale))
export const onSource = and(eq(source.photoId, photo.id), eq(source.locale, SOURCE_LOCALE))
const onAskedCategory = (locale: Locale) =>
  and(eq(askedCategory.categoryId, category.id), eq(askedCategory.locale, locale))
const onSourceCategory = and(
  eq(sourceCategory.categoryId, category.id),
  eq(sourceCategory.locale, SOURCE_LOCALE),
)

/**
 * The site's own words, keyed. Anything the archive says about itself comes from
 * here rather than from a component, so the panel can change it.
 *
 * The fallback is a spread rather than a join: `site_text` is keyed by
 * `(key, locale)` with a dozen rows per language, so both languages come back in
 * one scan and the merge is a line of JavaScript instead of a self-join.
 */
export const listSiteText = perLocale(
  'site-text',
  async (locale): Promise<Record<string, string>> => {
    const rows = await db
      .select({ key: siteText.key, locale: siteText.locale, value: siteText.value })
      .from(siteText)
      .where(inArray(siteText.locale, [locale, SOURCE_LOCALE]))

    const pick = (wanted: Locale) =>
      Object.fromEntries(
        rows.flatMap((r) => (r.locale === wanted && r.value ? [[r.key, r.value]] : [])),
      )
    return { ...pick(SOURCE_LOCALE), ...pick(locale) }
  },
)

/**
 * What the archive is, in numbers, for the masthead. Queried rather than written
 * into the markup so the line stays true as the archive grows.
 *
 * Not per language: photographs, credits and years are the three things
 * _Anything that is not language is not translated_ names, so all four locales
 * read the same row and share the one cache entry.
 */
export const archiveFacts = cached('archive-facts', async () => {
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
})

/** Sections in the order the panel decides, hidden ones left out, each with its cover. */
export const listSections = perLocale('sections', async (locale): Promise<Section[]> => {
  const rows = await db
    .select({
      slug: category.slug,
      name: NAME,
      intro: INTRO,
      coverSlug: photo.slug,
      coverKey: photo.webKey,
      coverWidth: photo.webWidth,
      coverHeight: photo.webHeight,
      coverSensitive: photo.sensitive,
      coverCaption: CAPTION,
      coverCredit: photo.credit,
    })
    .from(category)
    // The Spanish row is the inner join and the asked-for one is outer: Spanish
    // is what makes a section exist -- a section with no Spanish name is not a
    // section the panel could have created -- and any other language is optional
    // by design.
    .innerJoin(sourceCategory, onSourceCategory)
    .leftJoin(askedCategory, onAskedCategory(locale))
    .leftJoin(photo, and(eq(photo.id, category.coverPhotoId), eq(photo.published, true)))
    .leftJoin(asked, onAsked(locale))
    .leftJoin(source, onSource)
    .where(eq(category.visible, true))
    // `position` is typed by hand in the panel and nothing makes it unique, so a
    // tie has to break somewhere: without this Postgres may return two sections
    // in a different order on each revalidation, and the panel -- which orders by
    // the same pair -- would be previewing an order the site does not keep.
    .orderBy(asc(category.position), asc(category.slug))

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
})

/**
 * The home page's highlights. `photo.featured` is the only field behind it, and
 * the order is not its own: sections first, then curatorial order inside each --
 * which is ARCHITECTURE's decision that a `featured_position` gets added when
 * that default becomes annoying, and not before.
 *
 * A photograph in two sections joins twice and is still one highlight, so the
 * list is deduplicated by slug. `new Map` keeps each key's **last** row and its
 * first position, which is safe only because every column selected here comes
 * from `photo` or `photo_translation`, so the duplicate rows are identical.
 * Anything category-dependent added to this select would silently take its value
 * from the photograph's worst-placed section.
 *
 * ponytail: capped at twelve. It is a strip on the index, not a gallery, and a
 * home page that grows without limit is how an archive of 592 ends up with all
 * of them on the front. Raise the constant if they ever ask.
 */
export const FEATURED_LIMIT = 12

export const listFeatured = perLocale('featured', async (locale): Promise<PhotoCard[]> => {
  const rows = await db
    .select({
      slug: photo.slug,
      caption: CAPTION,
      credit: photo.credit,
      sensitive: photo.sensitive,
      webKey: photo.webKey,
      webWidth: photo.webWidth,
      webHeight: photo.webHeight,
    })
    .from(photo)
    .leftJoin(asked, onAsked(locale))
    .leftJoin(source, onSource)
    .leftJoin(photoCategory, eq(photoCategory.photoId, photo.id))
    .leftJoin(category, and(eq(category.id, photoCategory.categoryId), eq(category.visible, true)))
    .where(and(eq(photo.featured, true), eq(photo.published, true)))
    .orderBy(asc(category.position), asc(photoCategory.position), asc(photo.slug))

  const unique = [...new Map(rows.map((r) => [r.slug, r])).values()]
  // Same rule as the gallery: without derivatives there is nothing to show.
  return unique
    .flatMap((r) =>
      r.webKey && r.webWidth && r.webHeight
        ? [{ ...r, webKey: r.webKey, webWidth: r.webWidth, webHeight: r.webHeight }]
        : [],
    )
    .slice(0, FEATURED_LIMIT)
})

/** One section's photos, in the order its authors put them. */
export const listSectionPhotos = perLocale(
  'section-photos',
  async (locale, slug: string, page: number): Promise<PhotoCard[]> => {
    const rows = await db
      .select({
        slug: photo.slug,
        caption: CAPTION,
        credit: photo.credit,
        sensitive: photo.sensitive,
        webKey: photo.webKey,
        webWidth: photo.webWidth,
        webHeight: photo.webHeight,
      })
      .from(photoCategory)
      .innerJoin(category, eq(category.id, photoCategory.categoryId))
      .innerJoin(photo, eq(photo.id, photoCategory.photoId))
      .leftJoin(asked, onAsked(locale))
      .leftJoin(source, onSource)
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
)

/**
 * How many photographs each section holds, published or not, for
 * `generateStaticParams` on the pagination route. Same reason as `listPhotoSlugs`
 * below: counting only the published ones means publishing the 25th photograph
 * of a section makes the gallery render a "Siguiente" link to a page that has no
 * pre-rendered copy.
 *
 * A count, so it is the same in four languages.
 */
export const countSectionPhotos = cached(
  'section-photo-counts',
  async (): Promise<Record<string, number>> => {
    const rows = await db
      .select({ slug: category.slug, n: sql<number>`count(*)::int` })
      .from(photoCategory)
      .innerJoin(category, eq(category.id, photoCategory.categoryId))
      .groupBy(category.slug)
    return Object.fromEntries(rows.map((r) => [r.slug, r.n]))
  },
)

/**
 * Every photograph in the archive, for `generateStaticParams` on the detail page.
 *
 * **Every one, not only the published ones.** `generateStaticParams` runs at
 * build time and never again, so a slug missing from this list has no
 * pre-rendered page: publishing it from the panel writes the row, regenerates
 * the derivatives, reports success -- and the reader waits for a render that
 * could have been done at build time. Listing an unpublished photograph costs one
 * build-time render that ends in `notFound()`.
 *
 * The list stays inside the archive either way, so an invented slug still costs
 * nothing at build time: it is not in here, and nothing reaches the database for
 * it until somebody asks.
 *
 * Slugs, so it is the same in four languages -- and the route only pre-renders
 * the Spanish ones anyway; see its own note.
 */
export const listPhotoSlugs = cached('photo-slugs', async (): Promise<string[]> => {
  const rows = await db.select({ slug: photo.slug }).from(photo).orderBy(asc(photo.slug))
  return rows.map((r) => r.slug)
})

/**
 * Every public address the archive wants indexed, for `app/sitemap.ts`.
 *
 * **Only what is published and visible**, which is the one line that separates
 * this from `listPhotoSlugs` and `countSectionPhotos` directly above it. Those
 * two feed `generateStaticParams` and deliberately include what is hidden, so a
 * photograph published from the panel already has a pre-rendered page. A sitemap
 * is the opposite promise: it is what the archive tells Google to go and fetch,
 * and a hidden photograph's page answers 410 through the proxy. Listing it would
 * be asking a crawler to come and be told the address is dead.
 *
 * Paths and not URLs, and no locale: the four languages of each of these are
 * `localeHref` away, and the sitemap is where that multiplication belongs. It is
 * the same in four languages, so it is `cached` rather than `perLocale`.
 *
 * Pagination is counted over published photographs here, where the gallery's own
 * `generateStaticParams` counts all of them -- so a section whose last page holds
 * nothing but hidden photographs is not offered to a crawler, while its
 * pre-rendered page goes on existing. A visible section with nothing published
 * still gets its page one: it is in the header's menu, so it is reachable, and a
 * page that is linked and not listed is the inconsistency worth avoiding.
 *
 * It carries `GALLERY_TAG` like every other read on this side, so unpublishing
 * drops the sitemap's entry with the same `revalidateTag` that drops the gallery
 * the photograph was in.
 */
export const listPublicPaths = cached('public-paths', async (): Promise<string[]> => {
  const [photos, sections, videos] = await Promise.all([
    db
      .select({ slug: photo.slug })
      .from(photo)
      .where(eq(photo.published, true))
      .orderBy(asc(photo.slug)),
    db
      .select({ slug: category.slug, n: sql<number>`count(${photo.id})::int` })
      .from(category)
      // Both joins outer, and `count(photo.id)` rather than `count(*)`: a visible
      // section with nothing published still has to come back, with a zero.
      .leftJoin(photoCategory, eq(photoCategory.categoryId, category.id))
      .leftJoin(photo, and(eq(photo.id, photoCategory.photoId), eq(photo.published, true)))
      .where(eq(category.visible, true))
      .groupBy(category.slug, category.position)
      .orderBy(asc(category.position)),
    db
      .select({ slug: video.slug })
      .from(video)
      .where(eq(video.published, true))
      .orderBy(asc(video.slug)),
  ])

  return [
    '/',
    ...sections.flatMap(({ slug, n }) =>
      Array.from({ length: Math.max(1, Math.ceil(n / PER_PAGE)) }, (_, i) =>
        i === 0 ? `/categoria/${slug}` : `/categoria/${slug}/${i + 1}`,
      ),
    ),
    ...photos.map((r) => `/foto/${r.slug}`),
    // The Videoteca's own page only once there is something on it. A section
    // page listing nothing is not an address to send a crawler to, and the
    // header and the home page hide it under the same condition.
    ...(videos.length ? ['/videoteca'] : []),
    ...videos.map((r) => `/videoteca/${r.slug}`),
  ]
})

/**
 * One photograph, with everything its own page shows. The categories come back in
 * the panel's order and only if visible, because each one is rendered as a link to
 * a gallery that a hidden section does not have.
 */
export const getPhoto = perLocale(
  'photo',
  async (locale, slug: string): Promise<PhotoDetail | null> => {
    const rows = await db
      .select({
        slug: photo.slug,
        caption: CAPTION,
        notes: NOTES,
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
        categoryName: OPTIONAL_NAME,
      })
      .from(photo)
      .leftJoin(asked, onAsked(locale))
      .leftJoin(source, onSource)
      .leftJoin(photoCategory, eq(photoCategory.photoId, photo.id))
      .leftJoin(
        category,
        and(eq(category.id, photoCategory.categoryId), eq(category.visible, true)),
      )
      .leftJoin(askedCategory, onAskedCategory(locale))
      .leftJoin(sourceCategory, onSourceCategory)
      .where(and(eq(photo.slug, slug), eq(photo.published, true)))
      .orderBy(asc(category.position), asc(category.slug))

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
)

/**
 * A section's photos in curatorial order, slugs only: what the detail page needs to
 * find the one before and the one after, and to know which gallery page it came
 * from. The whole list rather than two neighbour queries, because it is cached once
 * per section instead of twice per photograph -- eleven queries for the build's 592
 * pages.
 *
 * Order and slugs, so it is the same in four languages.
 */
export const listCategoryOrder = cached(
  'category-order',
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
)

/**
 * The Videoteca, in curatorial order.
 *
 * Same fallback shape as everything else on this side, and the Spanish row is the
 * **inner** join for the same reason `category_translation`'s is: a video with no
 * Spanish title is not a video the panel could have made, since `createVideo`
 * writes that row in the transaction that creates the video.
 *
 * There is no count query beside this one. Three rows are cheaper to fetch than a
 * second cache entry is to keep honest, and the header and the home page want the
 * first poster as well as the number.
 */
const askedVideo = alias(videoTranslation, 'vt_asked')
const sourceVideo = alias(videoTranslation, 'vt_source')

const TITLE = sql<string | null>`coalesce(nullif(${askedVideo.title}, ''), ${sourceVideo.title})`
const DESCRIPTION = sql<
  string | null
>`coalesce(nullif(${askedVideo.description}, ''), ${sourceVideo.description})`

const onAskedVideo = (locale: Locale) =>
  and(eq(askedVideo.videoId, video.id), eq(askedVideo.locale, locale))
const onSourceVideo = and(eq(sourceVideo.videoId, video.id), eq(sourceVideo.locale, SOURCE_LOCALE))

const VIDEO_COLUMNS = {
  slug: video.slug,
  youtubeId: video.youtubeId,
  title: TITLE,
  description: DESCRIPTION,
  webKey: video.webKey,
  webWidth: video.webWidth,
  webHeight: video.webHeight,
}

/**
 * Without a poster there is nothing to draw, which is the same rule the galleries
 * apply to a photograph with no derivatives. Neither this nor a missing title can
 * happen through the panel -- the poster is written before the row is, and the
 * Spanish title is refused if it is blank -- but the columns are nullable, so the
 * narrowing has to be somewhere and it is better here than in every caller.
 */
function toVideo(row: {
  slug: string
  youtubeId: string
  title: string | null
  description: string | null
  webKey: string | null
  webWidth: number | null
  webHeight: number | null
}): Video[] {
  // The title is nullable per language, so the coalesce can in principle come back
  // empty -- it cannot in practice, because the panel refuses to write a Spanish
  // row without one, and this is where that stops being an assumption.
  if (!row.title || !row.webKey || !row.webWidth || !row.webHeight) return []
  return [
    {
      slug: row.slug,
      youtubeId: row.youtubeId,
      title: row.title,
      description: row.description,
      poster: {
        slug: row.slug,
        // The title is the poster's `alt`: it is what the image is of.
        caption: row.title,
        credit: null,
        // An interview from the archive's own channel is never behind the veil.
        sensitive: false,
        webKey: row.webKey,
        webWidth: row.webWidth,
        webHeight: row.webHeight,
      },
    },
  ]
}

export const listVideos = perLocale('videos', async (locale): Promise<Video[]> => {
  const rows = await db
    .select(VIDEO_COLUMNS)
    .from(video)
    .innerJoin(sourceVideo, onSourceVideo)
    .leftJoin(askedVideo, onAskedVideo(locale))
    .where(eq(video.published, true))
    .orderBy(asc(video.position), asc(video.slug))
  return rows.flatMap(toVideo)
})

/** One interview, for its own page. Null is `notFound()`, hidden included. */
export const getVideo = perLocale('video', async (locale, slug: string): Promise<Video | null> => {
  const rows = await db
    .select(VIDEO_COLUMNS)
    .from(video)
    .innerJoin(sourceVideo, onSourceVideo)
    .leftJoin(askedVideo, onAskedVideo(locale))
    .where(and(eq(video.slug, slug), eq(video.published, true)))
  return rows.flatMap(toVideo)[0] ?? null
})

/** Every slug, published or not, for `generateStaticParams`. Same rule as the photographs'. */
export const listVideoSlugs = cached('video-slugs', async (): Promise<string[]> => {
  const rows = await db.select({ slug: video.slug }).from(video).orderBy(asc(video.slug))
  return rows.map((r) => r.slug)
})
