import Link from 'next/link'
import { notFound } from 'next/navigation'
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

/**
 * Search, and the only page on the public site that is rendered per request: it
 * reads `searchParams`, which Next 16 documents as a request-time API, so the
 * route is dynamic by construction. That is the trade ARCHITECTURE makes on
 * purpose -- the database is touched here and nowhere else -- and it is paid for
 * with two caches: `unstable_cache` per query, and the CDN in front of `/buscar`
 * (see `headers()` in `next.config.ts`).
 *
 * Everything works with JavaScript off, which on this archive is the requirement
 * and not a courtesy: a GET form and links, no client state. Every combination of
 * query and filters is an address, so a result set can be sent to someone.
 *
 * Not localized on purpose, the same as T6 and T7: T13 brings next-intl and moves
 * these routes under `/[locale]`.
 */

/** A search result set is not a page of the archive: the photographs are. */
const ROBOTS = { index: false, follow: true }

export async function generateMetadata(props: PageProps<'/buscar'>): Promise<Metadata> {
  const params = await props.searchParams
  // Straight off the URL and capped: a title is a tab and a shared link, not a
  // place to render however much someone typed.
  const q = (Array.isArray(params.q) ? params.q[0] : params.q)?.trim().slice(0, 70)
  return { title: q ? `${q} · Buscar` : 'Buscar', robots: ROBOTS }
}

export default async function SearchPage(props: PageProps<'/buscar'>) {
  const params = await props.searchParams

  /**
   * The words first, because the filters are derived from what they reach: read
   * once with nothing chosen, which is the list the URL is validated against, and
   * again with the chosen filters, which is the list the selects are drawn from.
   * Offering the 1870s to a search for "tesolin" that has nothing there is a dead
   * end, and a filter that leads nowhere should not be on the menu.
   */
  const q = parseText(params)
  const [sections, rows] = await Promise.all([listSections(), facetRows(q)])
  const query: SearchQuery = { q, ...parseFilters(params, facetsFrom(rows, NO_FILTERS)) }
  const available = facetsFrom(rows, query)

  const page = parsePage(params.p)
  const filtered = query.section !== null || query.credit !== null || query.decade !== null
  const asked = query.q !== '' || filtered

  const { photos, total } = asked ? await search(query, page) : { photos: [], total: 0 }
  const pages = Math.ceil(total / PER_PAGE)
  // A page past the end is a hand-edited address, not a result set: the gallery
  // answers those with a 404 and so does this.
  if (asked && page > 1 && page > pages) notFound()

  return (
    <>
      <h1 className="t-section">Buscar</h1>

      {/* A GET form: the address bar holds the state, so the back button, a
          bookmark and a pasted link all behave. Nothing here needs JavaScript. */}
      <form action="/buscar" method="get" className="mt-8 sm:mt-10">
        <label className="t-label block" htmlFor="buscar-q">
          Epígrafes, apellidos, secciones
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
          placeholder="Ingresá un término"
        />

        <div className="mt-7 grid gap-5 sm:grid-cols-3 sm:gap-6">
          {/* Sections keep the panel's order, which is the one the index uses. */}
          <Filter name="seccion" label="Sección" value={query.section ?? ''} all="Todas">
            {sections.flatMap((s) => {
              const option = available.sections.find((o) => o.value === s.slug)
              return option
                ? [<Option key={s.slug} value={s.slug} label={s.name} n={option.count} />]
                : []
            })}
          </Filter>
          <Filter
            name="decada"
            label="Década"
            value={query.decade === null ? '' : String(query.decade)}
            all="Todas"
          >
            {available.decades.map((d) => (
              <Option key={d.value} value={d.value} label={String(d.value)} n={d.count} />
            ))}
          </Filter>
          <Filter name="credito" label="Quién la prestó" value={query.credit ?? ''} all="Todos">
            {available.credits.map((c) => (
              <Option key={c.value} value={c.value} label={c.value} n={c.count} />
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
            Buscar
          </button>
          {/* Keeps the words and drops the filters, which is the way out of a
              result set that a filter emptied. */}
          {filtered && (
            <Link
              href={searchHref({ q: query.q, section: null, credit: null, decade: null })}
              className="t-credit link hover:text-focus focus-visible:outline-focus py-2.5 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Quitar filtros
            </Link>
          )}
        </div>
      </form>

      <Results asked={asked} total={total} query={query} page={page} pages={pages} />

      {photos.length > 0 && (
        <>
          <PhotoWall photos={photos} eager={page === 1} />
          {pages > 1 && (
            <Pagination
              href={(n) => searchHref(query, n)}
              page={page}
              pages={pages}
              label="Paginación de resultados"
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
 * The count is on the option because the alternative is finding out by clicking:
 * "Deporte (4)" answers whether the filter is worth a round trip before it costs
 * one. Exact, not an estimate -- the other filters are already applied to it.
 *
 * One template literal rather than `{label} ({n})`, so the option is a single
 * text node instead of two with a comment wedged between them.
 */
function Option({ value, label, n }: { value: string | number; label: string; n: number }) {
  return <option value={value}>{`${label} (${n})`}</option>
}

/**
 * What came back, in words. The count is above the wall rather than below it,
 * because on a phone "sin resultados" found after two screens of scrolling is a
 * bug report.
 */
function Results({
  asked,
  total,
  query,
  page,
  pages,
}: {
  asked: boolean
  total: number
  query: SearchQuery
  page: number
  pages: number
}) {
  if (!asked) {
    return (
      <p className="t-intro text-muted mt-12 sm:mt-16">
        Buscá una palabra del epígrafe, el apellido de la familia que prestó la fotografía o el
        nombre de una sección. También podés filtrar sin escribir nada.
      </p>
    )
  }

  if (total === 0) {
    return (
      <p className="t-intro text-muted mt-12 sm:mt-16">
        No hay fotografías que respondan a esta búsqueda.
      </p>
    )
  }

  const from = (page - 1) * PER_PAGE + 1

  return (
    <p className="border-rule t-meta mt-12 flex flex-wrap gap-x-4 border-t pt-4 uppercase sm:mt-16">
      <span>
        {total} {total === 1 ? 'fotografía' : 'fotografías'}
      </span>
      {query.q && <span>«{query.q}»</span>}
      {pages > 1 && (
        <>
          <span>
            página {page} de {pages}
          </span>
          <span>
            {from}–{Math.min(from + PER_PAGE - 1, total)}
          </span>
        </>
      )}
    </p>
  )
}
