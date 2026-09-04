import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { listCategories, listTranslationQueue } from '@/db/queries/admin'
import { defaultLocale, isLocale, localeHref, LOCALE_LABELS } from '@/i18n/config'
import { requireAdmin } from '@/lib/auth'
import { Back, BUTTON, CONTROL, Notice, one } from '../../ui'
import { saveTranslations } from '../actions'
import { DEFAULT_FILTER, LANGUAGE, QUEUE_FILTERS } from '../items'
import { proposalsFor } from '../proposals'
import { TranslationRow } from '../row'

/**
 * The queue: one language, one kind of piece, a page of it at a time.
 *
 * **This is what makes 559 pieces per language a job somebody can actually
 * finish.** The dashboard next door says how much is left; this is where it gets
 * done, and it is built for being picked up and put down -- the filters are in
 * the address, so a half-finished session is a link, and saving comes back to the
 * same page of the same filter rather than to the top of the list.
 *
 * No route segment config and no `generateStaticParams`. Reading `searchParams`
 * is a request-time API and already opts the page into dynamic rendering, and
 * `/admin` is dynamic anyway because it reads the session; returning `[]` from
 * `generateStaticParams` would make the route **static**, which is the trap T13
 * already fell into once.
 */

/** A screenful of prose. Fewer than the list screens' 48: these rows are boxes to read. */
const PER_PAGE = 24

export async function generateMetadata(
  props: PageProps<'/admin/translations/[locale]'>,
): Promise<Metadata> {
  const { locale } = await props.params
  return { title: `Traducir al ${(LANGUAGE[locale] ?? locale).toLowerCase()}` }
}

export default async function TranslationQueue(props: PageProps<'/admin/translations/[locale]'>) {
  await requireAdmin()
  const { locale } = await props.params
  // Spanish has no queue: it is the source language, and it is edited on the
  // photo, section and site-text screens that already own it.
  if (!isLocale(locale) || locale === defaultLocale) notFound()

  const params = await props.searchParams
  const queParam = one(params.que)
  const que = queParam in QUEUE_FILTERS ? queParam : DEFAULT_FILTER
  const kind = QUEUE_FILTERS[que].kind
  const section = one(params.seccion)
  const done = one(params.ya) !== ''
  const page = Math.max(1, Number(one(params.p)) || 1)
  // Only captions and notes belong to a section; the other three kinds are the
  // sections themselves and the site's own words.
  const bySection = kind === 'caption' || kind === 'notes'

  const [categories, { rows, total }] = await Promise.all([
    listCategories(),
    listTranslationQueue(locale, kind, {
      section: bySection && section ? section : undefined,
      done,
      limit: PER_PAGE,
      offset: (page - 1) * PER_PAGE,
    }),
  ])

  const proposals = proposalsFor(locale)
  const pages = Math.max(1, Math.ceil(total / PER_PAGE))

  /** Keeps the filter when paging, without carrying the last write's outcome. */
  const href = (to: number) => {
    const query = new URLSearchParams()
    if (que !== DEFAULT_FILTER) query.set('que', que)
    if (bySection && section) query.set('seccion', section)
    if (done) query.set('ya', '1')
    if (to > 1) query.set('p', String(to))
    const string = query.toString()
    return `/admin/translations/${locale}${string ? `?${string}` : ''}`
  }

  return (
    <>
      <Back href="/admin/translations" label="Traducciones" />

      <h1 className="t-section mt-4">Traducir al {(LANGUAGE[locale] ?? locale).toLowerCase()}</h1>

      <p className="t-intro text-muted mt-6 max-w-[62ch]">
        El español es lo que escribieron los autores y no se toca acá. Lo que guardes en esta
        pantalla sale al sitio en {LANGUAGE[locale] ?? locale}; lo que dejes vacío sigue mostrándose
        en español, así que se puede traducir de a poco sin que quede ningún hueco.{' '}
        {/* An anchor and not a Link: Next keeps a statically generated page in the
            client for five minutes, and this link exists precisely to check what
            was just saved. */}
        <a
          href={localeHref(locale, '/')}
          className="t-credit link text-muted hover:text-text focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          ver el sitio en {LOCALE_LABELS[locale]} →
        </a>
      </p>

      <Notice params={params} />

      <form method="get" className="mt-8 flex flex-wrap items-end gap-3">
        <label className="grow basis-48">
          <span className="t-label block pb-1.5">Qué</span>
          <select name="que" defaultValue={que} className={CONTROL}>
            {Object.entries(QUEUE_FILTERS).map(([value, { label }]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {bySection && (
          <label className="grow basis-40">
            <span className="t-label block pb-1.5">Sección</span>
            <select name="seccion" defaultValue={section} className={CONTROL}>
              <option value="">Todas</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex basis-full items-center gap-2 sm:basis-auto">
          <input
            type="checkbox"
            name="ya"
            value="1"
            defaultChecked={done}
            className="accent-accent focus-visible:outline-focus h-4 w-4 focus-visible:outline-2 focus-visible:outline-offset-2"
          />
          <span className="t-label">Ver las ya cargadas, para corregirlas</span>
        </label>
        <button type="submit" className={BUTTON}>
          Filtrar
        </button>
      </form>

      <p className="t-meta mt-6">
        {total} {done ? 'ya cargadas' : 'sin traducir'}
        {pages > 1 && ` · página ${page} de ${pages}`}
      </p>

      {rows.length === 0 ? (
        <p className="t-intro mt-8 max-w-[62ch]">
          {done
            ? 'Todavía no hay nada cargado con este filtro.'
            : 'No queda nada por traducir con este filtro.'}
        </p>
      ) : (
        <form action={saveTranslations} className="mt-8">
          {/* The filter, so saving comes back to the same place. Every one of these
              is validated again in the action against a closed set of values: not
              one string from this form is concatenated into an address. */}
          <input type="hidden" name="idioma" value={locale} />
          <input type="hidden" name="que" value={que} />
          {bySection && section && <input type="hidden" name="seccion" value={section} />}
          {page > 1 && <input type="hidden" name="p" value={String(page)} />}
          {done && <input type="hidden" name="ya" value="1" />}

          <div className="grid max-w-2xl gap-6">
            {rows.map((row) => (
              <TranslationRow
                key={row.id}
                locale={locale}
                item={{ kind, id: row.id }}
                source={row.source}
                current={row.current}
                proposed={proposals.get(row.source)}
              />
            ))}
          </div>

          <p className="t-meta text-muted mt-8 max-w-[62ch]">
            Guardar publica estos textos en el sitio como revisados por vos. Lo que dejes vacío no
            se guarda: esa pieza vuelve a mostrarse en español.
          </p>
          <button type="submit" className={`${BUTTON} mt-3`}>
            Guardar esta página
          </button>
        </form>
      )}

      {pages > 1 && (
        <nav aria-label="Paginación" className="mt-10 flex justify-between gap-4">
          {page > 1 ? (
            <Link href={href(page - 1)} className="t-credit link hover:text-text py-2">
              ← Anteriores
            </Link>
          ) : (
            <span />
          )}
          {page < pages && (
            <Link href={href(page + 1)} className="t-credit link hover:text-text py-2">
              Siguientes →
            </Link>
          )}
        </nav>
      )}
    </>
  )
}
