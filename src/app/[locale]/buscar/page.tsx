import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { Pagination, PhotoWall } from '@/components/photo-wall'
import { PER_PAGE, listSections } from '@/db/queries/gallery'
import {
  NO_FILTERS,
  type SearchQuery,
  facetRows,
  facetsFrom,
  parseFilters,
  parsePage,
  parseText,
  search,
  searchHref,
} from '@/db/queries/search'
import { alternatesFor, isLocale, localeHref, type Locale } from '@/i18n/config'

/**
 * Search, and the only page on the public site that is rendered per request: it
 * reads `searchParams`, which Next 16 documents as a request-time API, so the
 * route is dynamic by construction. That is the trade ARCHITECTURE makes on
 * purpose -- the database is touched here and nowhere else -- and it is paid for
 * by `unstable_cache` per query, now per query **and language**.
 *
 * Everything works with JavaScript off, which on this archive is the requirement
 * and not a courtesy: a GET form and links, no client state. Every combination of
 * query and filters is an address, so a result set can be sent to someone.
 *
 * Localized since T13, in three places that are easy to miss: the text search
 * configuration follows the language (`en_unaccent` stems "weddings" to "wedding"),
 * the caption shown under each result is the language's with Spanish behind it, and
 * the family names in the filter are collated in the reader's own language.
 */

/** A search result set is not a page of the archive: the photographs are. */
const ROBOTS = { index: false, follow: true }

export async function generateMetadata(props: PageProps<'/[locale]/buscar'>): Promise<Metadata> {
  const [{ locale }, params] = await Promise.all([props.params, props.searchParams])
  if (!isLocale(locale)) return {}
  const t = await getTranslations({ locale, namespace: 'search' })
  // Straight off the URL and capped: a title is a tab and a shared link, not a
  // place to render however much someone typed.
  const q = (Array.isArray(params.q) ? params.q[0] : params.q)?.trim().slice(0, 70)
  return {
    title: q ? t('titleWithQuery', { q }) : t('title'),
    robots: ROBOTS,
    // `noindex` already, so this is for the reader's address bar rather than for a
    // crawler: the four languages of the same search are still four addresses.
    alternates: alternatesFor(locale, '/buscar'),
  }
}

export default async function SearchPage(props: PageProps<'/[locale]/buscar'>) {
  const [{ locale: askedLocale }, params] = await Promise.all([props.params, props.searchParams])
  if (!isLocale(askedLocale)) notFound()
  const locale: Locale = askedLocale
  const t = await getTranslations({ locale, namespace: 'search' })

  /**
   * The words first, because the filters are derived from what they reach: read
   * once with nothing chosen, which is the list the URL is validated against, and
   * again with the chosen filters, which is the list the selects are drawn from.
   * Offering the 1870s to a search for "tesolin" that has nothing there is a dead
   * end, and a filter that leads nowhere should not be on the menu.
   */
  const q = parseText(params)
  const [sections, rows] = await Promise.all([listSections(locale), facetRows(locale, q)])
  const query: SearchQuery = {
    q,
    ...parseFilters(params, facetsFrom(rows, NO_FILTERS, locale)),
  }
  const available = facetsFrom(rows, query, locale)

  const page = parsePage(params.p)
  const filtered = query.section !== null || query.credit !== null || query.decade !== null
  const asked = query.q !== '' || filtered

  const { photos, total } = asked ? await search(locale, query, page) : { photos: [], total: 0 }
  const pages = Math.ceil(total / PER_PAGE)
  // A page past the end is a hand-edited address, not a result set: the gallery
  // answers those with a 404 and so does this.
  if (asked && page > 1 && page > pages) notFound()

  return (
    <>
      <h1 className="t-section">{t('title')}</h1>

      {/* A GET form: the address bar holds the state, so the back button, a
          bookmark and a pasted link all behave. Nothing here needs JavaScript. */}
      <form action={localeHref(locale, '/buscar')} method="get" className="mt-8 sm:mt-10">
        <label className="t-label block" htmlFor="buscar-q">
          {t('label')}
        </label>
        <input
          id="buscar-q"
          name="q"
          type="search"
          defaultValue={query.q}
          maxLength={100}
          autoCapitalize="off"
          spellCheck={false}
          className="field text-text placeholder:text-muted mt-2 w-full font-serif text-[19px] sm:text-[23px]"
          placeholder={t('placeholder')}
        />

        <div className="mt-7 grid gap-5 sm:grid-cols-3 sm:gap-6">
          {/* Sections keep the panel's order, which is the one the index uses. */}
          <Filter
            name="seccion"
            label={t('section')}
            value={query.section ?? ''}
            all={t('allSections')}
          >
            {sections.flatMap((s) => {
              const option = available.sections.find((o) => o.value === s.slug)
              return option
                ? [
                    <option key={s.slug} value={s.slug}>
                      {t('option', { label: s.name, count: option.count })}
                    </option>,
                  ]
                : []
            })}
          </Filter>
          <Filter
            name="decada"
            label={t('decade')}
            value={query.decade === null ? '' : String(query.decade)}
            all={t('allDecades')}
          >
            {available.decades.map((d) => (
              <option key={d.value} value={d.value}>
                {t('option', { label: String(d.value), count: d.count })}
              </option>
            ))}
          </Filter>
          <Filter
            name="credito"
            label={t('credit')}
            value={query.credit ?? ''}
            all={t('allCredits')}
          >
            {available.credits.map((c) => (
              <option key={c.value} value={c.value}>
                {t('option', { label: c.value, count: c.count })}
              </option>
            ))}
          </Filter>
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
          {/* Not `.t-credit`: that rule is unlayered author CSS and sets the accent
              colour, which beats a `text-*` utility in `@layer utilities` -- accent
              on an accent fill is invisible. Its metrics, without its colour. */}
          <button
            type="submit"
            className="link bg-accent text-ground hover:bg-focus focus-visible:outline-focus px-5 py-2.5 font-sans text-[16px] leading-[1.4] focus-visible:outline-2 focus-visible:outline-offset-2 sm:text-[17px]"
          >
            {t('submit')}
          </button>
          {/* Keeps the words and drops the filters, which is the way out of a
              result set that a filter emptied. */}
          {filtered && (
            <Link
              href={searchHref(locale, { q: query.q, section: null, credit: null, decade: null })}
              className="t-credit link hover:text-focus focus-visible:outline-focus py-2.5 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {t('clear')}
            </Link>
          )}
        </div>
      </form>

      <Results
        asked={asked}
        total={total}
        query={query}
        page={page}
        pages={pages}
        locale={locale}
      />

      {photos.length > 0 && (
        <>
          <PhotoWall photos={photos} locale={locale} eager={page === 1} />
          {pages > 1 && (
            <Pagination
              href={(n) => searchHref(locale, query, n)}
              page={page}
              pages={pages}
              label={t('pagination')}
              locale={locale}
            />
          )}
        </>
      )}
    </>
  )
}

/** A native `<select>`: the platform's own picker, and it needs no script. */
function Filter({
  name,
  label,
  value,
  all,
  children,
}: {
  name: string
  label: string
  value: string
  all: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="t-label block" htmlFor={`buscar-${name}`}>
        {label}
      </label>
      <select
        id={`buscar-${name}`}
        name={name}
        defaultValue={value}
        className="field text-text mt-2 w-full font-sans text-[16px]"
      >
        <option value="">{all}</option>
        {children}
      </select>
    </div>
  )
}

/**
 * What came back, in words. The count is above the wall rather than below it,
 * because on a phone "sin resultados" found after two screens of scrolling is a
 * bug report.
 *
 * The option labels and this count are ICU plurals rather than a ternary on the
 * noun: the archive's four languages do not share a plural rule, and the previous
 * `total === 1 ? 'fotografía' : 'fotografías'` had the Spanish one written into
 * the component.
 */
async function Results({
  asked,
  total,
  query,
  page,
  pages,
  locale,
}: {
  asked: boolean
  total: number
  query: SearchQuery
  page: number
  pages: number
  locale: Locale
}) {
  const t = await getTranslations({ locale, namespace: 'search' })
  const tg = await getTranslations({ locale, namespace: 'gallery' })

  if (!asked) {
    return <p className="t-intro text-muted mt-12 sm:mt-16">{t('help')}</p>
  }

  if (total === 0) {
    return <p className="t-intro text-muted mt-12 sm:mt-16">{t('empty')}</p>
  }

  const from = (page - 1) * PER_PAGE + 1

  return (
    <p className="border-rule t-meta mt-12 flex flex-wrap gap-x-4 border-t pt-4 uppercase sm:mt-16">
      <span>{t('results', { count: total })}</span>
      {query.q && <span>{t('query', { q: query.q })}</span>}
      {pages > 1 && (
        <>
          <span>{tg('page', { page, pages })}</span>
          <span>{t('range', { from, to: Math.min(from + PER_PAGE - 1, total) })}</span>
        </>
      )}
    </p>
  )
}
