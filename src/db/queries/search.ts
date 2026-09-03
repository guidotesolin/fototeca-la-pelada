import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { category, photo, photoCategory } from '@/db/schema'
import { localeHref, type Locale } from '@/i18n/config'
import {
  CAPTION,
  PER_PAGE,
  SOURCE_LOCALE,
  asked,
  onAsked,
  onSource,
  perLocale,
  source,
  type PhotoCard,
} from './gallery'

/**
 * Search, which ARCHITECTURE names as the one place the database is touched per
 * visit -- everything else on the public site is prerendered. So the results are
 * cached by query, per language, and a repeated search costs Neon nothing.
 *
 * Nothing about it reaches the client. A search index shipped to the browser is
 * ~90 KB paid for with rural mobile data, which is the trade this whole design is
 * built to avoid.
 */

/**
 * The four configurations T2 created in `drizzle/0001_search_config.sql`:
 * `unaccent` in front of the stemmer, which is what makes "Tesolin" find
 * "Tesolín" and "educacion" find "Educación". The row's own configuration is
 * picked by the trigger that fills `search_vector`; this is the same choice on
 * the query side, so an English search is stemmed by English rules.
 *
 * The values are written out rather than built as `${locale}_unaccent`, because
 * they name objects in the database: a typo has to be a type error here and not
 * a 500 in front of a reader.
 */
const SEARCH_CONFIG: Record<Locale, string> = {
  es: 'es_unaccent',
  en: 'en_unaccent',
  fr: 'fr_unaccent',
  it: 'it_unaccent',
}

/** Longer than this is not a search, it is a payload. */
const MAX_QUERY = 100

export type SearchFilters = {
  section: string | null
  credit: string | null
  decade: number | null
}

export type SearchQuery = SearchFilters & { q: string }

export type SearchResults = { photos: PhotoCard[]; total: number }

/**
 * What each filter can offer, and how many photographs each option would return.
 * The count is exact -- it is taken with the other filters already applied, so it
 * is the number the reader gets after choosing. Sections come back as slugs.
 */
export type Options<T> = { value: T; count: number }[]

export type Facets = {
  sections: Options<string>
  credits: Options<string>
  decades: Options<number>
}

export const NO_FILTERS: SearchFilters = { section: null, credit: null, decade: null }

/**
 * What a search reads, in the language it was asked in.
 *
 * **One `to_tsvector` over the text, and not the stored `search_vector`, and that
 * is the whole correctness of it.** The obvious version -- coalesce the asked
 * locale's stored vector with the Spanish one and match the result against a
 * query stemmed in the asked locale -- is wrong, and it shipped once. A stored
 * vector was stemmed by whatever configuration wrote it: the trigger in
 * `drizzle/0001_search_config.sql` builds the Spanish row with `es_unaccent`, so
 * it holds `'escuel'`, while `/en` asks `websearch_to_tsquery('en_unaccent',
 * 'escuela')` for `'escuela'`. Those never meet. Measured against the archive:
 * "escuela" found 25 photographs in Spanish and **0** in English, on the very
 * pages that render those Spanish captions. French and Italian happened to find
 * all 25, because their stemmers truncate "escuela" to `escuel` too -- which is
 * worse than failing outright, since it makes the defect look like an English
 * problem rather than a structural one.
 *
 * Re-tokenizing the text fixes it by construction: whatever the reader typed and
 * whatever the archive holds go through the *same* configuration. It costs
 * nothing this query was not already paying -- the GIN index never served it (see
 * the note below) -- and it buys a second thing, which is that the fallback is
 * now **field-level and identical to `CAPTION` in `gallery.ts`**: search matches
 * exactly the text the page will show, rather than a whole row's worth of the
 * wrong language.
 *
 * `photo_translation.search_vector` is therefore no longer read by the public
 * query. It is kept because the trigger keeps it true for free and because it is
 * the landing place for the ceiling below: folding the credit and the section
 * names in, per locale, is what makes a GIN index able to serve this.
 *
 * The credit and the section names are in the document because the column alone
 * answers neither acceptance criterion on this archive. 62 photographs are
 * "Cortesía: Familia Tesolín" and only **one** names a Tesolín in its caption; a
 * reader typing a surname wants the sixty-two. And "Educación" is a section name
 * that appears in no caption at all. Both are composed here rather than folded
 * into the column, because neither belongs to the translation row -- a credit
 * lives on `photo` and a section on `photo_category`, so a trigger on
 * `photo_translation` cannot see either change.
 *
 * ponytail: composed per row at query time, so no index serves this query -- 592
 * rows, measured at 5.5 ms unfiltered and 0.6 ms with a filter. The ceiling is
 * the row count, a few thousand. Past it, write this same expression into a
 * generated-or-triggered column per locale and index that.
 */
const DOCUMENT = (
  locale: Locale,
) => sql`to_tsvector(${SEARCH_CONFIG[locale]}::regconfig, concat_ws(' ',
  coalesce(nullif(${asked.caption}, ''), ${source.caption}),
  coalesce(nullif(${asked.notes}, ''), ${source.notes}),
  ${photo.credit},
  (select string_agg(coalesce(nullif(ct.name, ''), ct_source.name), ' ')
     from photo_category pc
     join category_translation ct_source
       on ct_source.category_id = pc.category_id
      and ct_source.locale = ${SOURCE_LOCALE}::locale
     left join category_translation ct
       on ct.category_id = pc.category_id and ct.locale = ${locale}::locale
    where pc.photo_id = ${photo.id})
))`

/**
 * `websearch_to_tsquery` and not `to_tsquery`: it takes whatever a person types --
 * quotes, `or`, a lone hyphen, an empty string -- and never raises. A search box
 * that can be made to throw is a search box that can be made to 500.
 */
const tsquery = (locale: Locale, q: string) =>
  sql`websearch_to_tsquery(${SEARCH_CONFIG[locale]}::regconfig, ${q})`

/** Both years are inclusive and a photograph can span decades: this is an overlap. */
const inDecade = (decade: number) =>
  sql`${photo.yearFrom} <= ${decade + 9} and coalesce(${photo.yearTo}, ${photo.yearFrom}) >= ${decade}`

/** `exists` rather than a join: a photo in two sections must not come back twice. */
const inSection = (slug: string) =>
  sql`exists (
    select 1 from photo_category pc
      join category c on c.id = pc.category_id
     where pc.photo_id = ${photo.id} and c.slug = ${slug}
  )`

/** Published, and matching the words if there are any. The floor under everything. */
const matchingText = (locale: Locale, q: string) => [
  eq(photo.published, true),
  ...(q ? [sql`${DOCUMENT(locale)} @@ ${tsquery(locale, q)}`] : []),
]

/**
 * A page of results, with the total the pagination needs -- as a window function,
 * so the count and the page come back in one round trip.
 *
 * With no text and only filters this is a browse rather than a search, which is
 * the same query with one predicate fewer. Sensitive photographs are in here like
 * any other, blurred by `PhotoImage`: searching "carneada" and not finding the
 * carneadas would be the incoherence ARCHITECTURE rules out.
 */
export async function runSearch(
  locale: Locale,
  { q, section, credit, decade }: SearchQuery,
  page: number,
): Promise<SearchResults> {
  const where = matchingText(locale, q)
  if (section) where.push(inSection(section))
  if (credit) where.push(eq(photo.credit, credit))
  if (decade !== null) where.push(inDecade(decade))

  const rows = await db
    .select({
      slug: photo.slug,
      caption: CAPTION,
      credit: photo.credit,
      sensitive: photo.sensitive,
      webKey: photo.webKey,
      webWidth: photo.webWidth,
      webHeight: photo.webHeight,
      total: sql<number>`count(*) over ()::int`,
    })
    .from(photo)
    .leftJoin(asked, onAsked(locale))
    .leftJoin(source, onSource)
    .where(and(...where))
    // Relevance only when something was typed; otherwise every rank is 0 and the
    // slug is doing the ordering anyway, so the archive's own order stands.
    .orderBy(
      ...(q ? [desc(sql`ts_rank(${DOCUMENT(locale)}, ${tsquery(locale, q)})`)] : []),
      asc(photo.slug),
    )
    .limit(PER_PAGE)
    .offset((page - 1) * PER_PAGE)

  // Same rule as the gallery: without derivatives there is nothing to show.
  return {
    total: rows[0]?.total ?? 0,
    photos: rows.flatMap((r) =>
      r.webKey && r.webWidth && r.webHeight
        ? [{ ...r, webKey: r.webKey, webWidth: r.webWidth, webHeight: r.webHeight }]
        : [],
    ),
  }
}

/**
 * The cached ones, which are what the page calls. `unstable_cache` needs a request
 * context, so `npm run search:smoke` calls the uncached functions instead.
 *
 * `perLocale` is `gallery.ts`'s, and using it here is the point: a result set
 * cached for one language must never be served to another, and there is one place
 * that rule is written down.
 */
export const search = perLocale('search', runSearch)

/** One row per photograph the words reach: only what the three filters read. */
export type FacetRow = {
  credit: string | null
  yearFrom: number | null
  yearTo: number | null
  sections: string[]
}

/**
 * Everything the words reach, reduced to the three filterable fields. The filters
 * are then derived from this in memory rather than by three more round trips --
 * 592 rows at worst, and one cache entry per query serves all of its pages.
 *
 * Per language because the words reach a different set in each: what matches
 * "wedding" in English is not what matches it in Spanish, so the decades and the
 * families on offer are not the same either.
 *
 * ponytail: the whole matching set comes back, so an archive of tens of thousands
 * would be moving real bytes for a dropdown. The way out is three grouped queries
 * with the other filters applied, which is this same arithmetic written in SQL.
 */
export async function runFacetRows(locale: Locale, q: string): Promise<FacetRow[]> {
  return db
    .select({
      credit: photo.credit,
      yearFrom: photo.yearFrom,
      yearTo: photo.yearTo,
      sections: sql<
        string[]
      >`coalesce(array_agg(${category.slug}) filter (where ${category.slug} is not null), '{}')`,
    })
    .from(photo)
    .leftJoin(asked, onAsked(locale))
    .leftJoin(source, onSource)
    .leftJoin(photoCategory, eq(photoCategory.photoId, photo.id))
    .leftJoin(category, eq(category.id, photoCategory.categoryId))
    .where(and(...matchingText(locale, q)))
    .groupBy(photo.id)
}

export const facetRows = perLocale('facet-rows', runFacetRows)

/**
 * Which decades a photograph touches, by the same overlap rule `inDecade` applies
 * in SQL -- so a decade is offered exactly when choosing it would find something.
 */
function decadesOf({ yearFrom, yearTo }: FacetRow): number[] {
  if (yearFrom === null) return []
  const first = Math.floor(yearFrom / 10) * 10
  const last = Math.floor((yearTo ?? yearFrom) / 10) * 10
  const decades = []
  for (let d = first; d <= last; d += 10) decades.push(d)
  return decades
}

/**
 * What each filter should offer, given the ones already chosen.
 *
 * A filter is computed **without its own value** and with the other two applied,
 * which is the only version that does not trap the reader: searching "tesolin"
 * must not offer the 1870s, and choosing a decade must still leave every section
 * reachable. Called once with `NO_FILTERS` it returns everything the words reach,
 * which is what the incoming URL is validated against.
 *
 * The chosen value is always kept in its own list, even when the combination
 * finds nothing -- a `<select>` that silently fell back to "Todas" would be
 * lying about the results underneath it.
 */
export function facetsFrom(
  rows: FacetRow[],
  { section, credit, decade }: SearchFilters,
  locale: Locale,
): Facets {
  const bySection = (r: FacetRow) => !section || r.sections.includes(section)
  const byCredit = (r: FacetRow) => !credit || r.credit === credit
  const byDecade = (r: FacetRow) => decade === null || decadesOf(r).includes(decade)

  /**
   * One photograph counts once per value it carries -- once in each of its two
   * sections, once in every decade its years span -- which is exactly how the SQL
   * filters find it, so the number on the menu is the number of results.
   */
  const tally = <T>(kept: FacetRow[], valuesOf: (row: FacetRow) => T[], chosen: T | null) => {
    const counts = new Map<T, number>()
    // The chosen value keeps its place even at zero: a `<select>` that quietly
    // fell back to "Todas" would be lying about the results underneath it.
    if (chosen !== null) counts.set(chosen, 0)
    for (const row of kept) {
      for (const value of valuesOf(row)) counts.set(value, (counts.get(value) ?? 0) + 1)
    }
    return [...counts].map(([value, count]) => ({ value, count }))
  }

  return {
    sections: tally(
      rows.filter((r) => byCredit(r) && byDecade(r)),
      (r) => r.sections,
      section,
    ),
    // Sorted in the reader's own language: the credits are surnames, and where
    // "Ñ" and "Ö" fall is not the same question in Spanish and in Italian.
    credits: tally(
      rows.filter((r) => bySection(r) && byDecade(r)),
      (r) => (r.credit ? [r.credit] : []),
      credit,
    ).sort((a, b) => a.value.localeCompare(b.value, locale)),
    decades: tally(
      rows.filter((r) => bySection(r) && byCredit(r)),
      decadesOf,
      decade,
    ).sort((a, b) => a.value - b.value),
  }
}

const one = (params: Record<string, string | string[] | undefined>, key: string) => {
  const value = params[key]
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

/** The words, capped. Read first, because the filter lists depend on them. */
export function parseText(params: Record<string, string | string[] | undefined>): string {
  return one(params, 'q').slice(0, MAX_QUERY)
}

/**
 * The filters as they came off the URL, reduced to what the words actually reach.
 * Anything else is dropped rather than answered with an empty page: a value
 * nobody could have selected is a stale link or a probe, and dropping it is also
 * what stops `?credito=<anything>` from minting a cache entry per request.
 */
export function parseFilters(
  params: Record<string, string | string[] | undefined>,
  available: Facets,
): SearchFilters {
  const pick = <T extends string | number>(value: string, allowed: Options<T>) =>
    allowed.find((a) => String(a.value) === value)?.value ?? null

  return {
    section: pick(one(params, 'seccion'), available.sections),
    credit: pick(one(params, 'credito'), available.credits),
    decade: pick(one(params, 'decada'), available.decades),
  }
}

/**
 * A page number off the URL: a positive integer, capped so that no hand-edited
 * address can ask Postgres for an absurd offset.
 */
export function parsePage(value: string | string[] | undefined): number {
  const n = Math.trunc(Number((Array.isArray(value) ? value[0] : value) ?? 1))
  return Number.isFinite(n) && n > 1 ? Math.min(n, 10_000) : 1
}

/**
 * Every search and every combination of filters is an address someone can send --
 * in the language it was searched in. The parameter names stay Spanish in all
 * four, like the path segments: they are part of the URL, and a URL that has been
 * shared does not get to change spelling.
 */
export function searchHref(
  locale: Locale,
  { q, section, credit, decade }: SearchQuery,
  page = 1,
): string {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (section) params.set('seccion', section)
  if (credit) params.set('credito', credit)
  if (decade !== null) params.set('decada', String(decade))
  if (page > 1) params.set('p', String(page))
  const query = params.toString()
  return localeHref(locale, '/buscar') + (query ? `?${query}` : '')
}
