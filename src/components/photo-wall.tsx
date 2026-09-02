import Link from 'next/link'
import { PhotoImage } from '@/components/photo-image'
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

export function PhotoWall({ photos, eager = false }: { photos: PhotoCard[]; eager?: boolean }) {
  return (
    <ul className="wall mt-10 sm:mt-14">
      {photos.map((photo, index) => (
        <WallCell key={photo.slug} photo={photo} priority={eager && index < EAGER} />
      ))}
    </ul>
  )
}

function WallCell({ photo, priority }: { photo: PhotoCard; priority: boolean }) {
  return (
    <li>
      <figure>
        <Link
          href={`/foto/${photo.slug}`}
          prefetch={false}
          className="group focus-visible:outline-focus block focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <div className="mount">
            <PhotoImage photo={photo} sizes={SIZES} priority={priority} />
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
export function Pagination({
  href,
  page,
  pages,
  label,
}: {
  href: (page: number) => string
  page: number
  pages: number
  label: string
}) {
  const all = Array.from({ length: pages }, (_, i) => i + 1)
  const near = all.filter((n) => Math.abs(n - page) <= 1)

  const number = (n: number, hidden = false) =>
    n === page ? (
      <span aria-current="page" className="t-meta text-accent px-1">
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
              ← Anterior
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
              Siguiente →
            </Link>
          </li>
        )}
      </ul>
    </nav>
  )
}
