import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { PhotoImage } from '@/components/photo-image'
import { photoImageLabels } from '@/i18n/labels'
import { localeHref, type Locale } from '@/i18n/config'
import type { PhotoImageLabels } from '@/components/photo-image'
import type { PhotoCard } from '@/db/queries/gallery'

/**
 * The paged grid of photographs, shared by a section's gallery and by the search
 * results -- they are the same wall over different queries, and the search results
 * must blur a sensitive photograph exactly the way the gallery does.
 *
 * The packing is `.wall` in globals.css: CSS multi-column, so it is the browser's
 * and not a script's. Each cell reserves its own height from the stored dimensions,
 * which is the whole of the layout-shift story.
 */

/**
 * The widest a cell gets is a quarter of the 1248 px content box less its gutters, so
 * about 294 px; the step above that is never needed.
 */
const SIZES = '(min-width: 1000px) 300px, (min-width: 640px) 33vw, 50vw'

/** The first row is what the LCP measures, so it is the only one not deferred. */
const EAGER = 2

export async function PhotoWall({
  photos,
  locale,
  eager = false,
}: {
  photos: PhotoCard[]
  locale: Locale
  eager?: boolean
}) {
  // Once for the whole wall rather than once per cell: `getTranslations` is
  // memoized per request either way, but a cell should not have to know.
  const labels = await photoImageLabels(locale)

  return (
    <ul className="wall mt-10 sm:mt-14">
      {photos.map((photo, index) => (
        <WallCell
          key={photo.slug}
          photo={photo}
          locale={locale}
          labels={labels}
          priority={eager && index < EAGER}
        />
      ))}
    </ul>
  )
}

/**
 * The caption and the credit are the data's own, already resolved to the reader's
 * language (or fallen back to Spanish) by the query. The only thing the locale is
 * needed for here is the address.
 */
function WallCell({
  photo,
  locale,
  labels,
  priority,
}: {
  photo: PhotoCard
  locale: Locale
  labels: PhotoImageLabels
  priority: boolean
}) {
  return (
    <li>
      <figure>
        <Link
          href={localeHref(locale, `/foto/${photo.slug}`)}
          prefetch={false}
          className="group focus-visible:outline-focus block focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <div className="mount">
            <PhotoImage photo={photo} sizes={SIZES} labels={labels} priority={priority} />
          </div>
        </Link>
        <figcaption className="pt-3">
          {photo.caption && (
            <p className="t-caption-grid text-muted group-hover:text-text link line-clamp-4">
              {photo.caption}
            </p>
          )}
          {photo.credit && <p className="t-credit mt-1 text-[15px]">{photo.credit}</p>}
        </figcaption>
      </figure>
    </li>
  )
}

/**
 * Real links with addresses of their own. On a phone only previous, current and
 * next: five 44 px targets do not fit without cramping the touch area.
 *
 * The caller builds the address, because a section paginates in the path
 * (`/categoria/campo/2`, prerenderable) and a search paginates in the query string
 * (`?p=2`, which the filters are already in).
 *
 * ponytail: the number targets are 16-19 px, under WCAG 2.2 SC 2.5.8's 24. That is
 * F25, inherited from T6 and now in one place instead of two.
 */
export async function Pagination({
  href,
  page,
  pages,
  label,
  locale,
}: {
  href: (page: number) => string
  page: number
  pages: number
  label: string
  locale: Locale
}) {
  // "Anterior"/"Siguiente" are the same words the photo page's own pair uses, so
  // they come from the same namespace. The nav's name stays a prop: a section's
  // pagination and a result set's are not the same thing to a screen reader.
  const t = await getTranslations({ locale, namespace: 'gallery' })

  const all = Array.from({ length: pages }, (_, i) => i + 1)
  const near = all.filter((n) => Math.abs(n - page) <= 1)

  const number = (n: number, hidden = false) =>
    n === page ? (
      <span aria-current="page" className="t-meta px-1">
        {n}
      </span>
    ) : (
      <Link
        href={href(n)}
        className={`t-meta hover:text-text focus-visible:outline-focus px-1 focus-visible:outline-2 focus-visible:outline-offset-2 ${
          hidden ? 'hidden sm:inline' : ''
        }`}
      >
        {n}
      </Link>
    )

  return (
    <nav aria-label={label} className="border-rule mt-16 border-t pt-6">
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {page > 1 && (
          <li>
            <Link
              href={href(page - 1)}
              rel="prev"
              className="t-credit link text-muted hover:text-text focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              ← {t('previous')}
            </Link>
          </li>
        )}
        {all.map((n) => (
          <li key={n}>{number(n, !near.includes(n))}</li>
        ))}
        {page < pages && (
          <li>
            <Link
              href={href(page + 1)}
              rel="next"
              className="t-credit link text-muted hover:text-text focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {t('next')} →
            </Link>
          </li>
        )}
      </ul>
    </nav>
  )
}
