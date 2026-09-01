import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PhotoImage } from '@/components/photo-image'
import { PER_PAGE, type PhotoCard, type Section, listSectionPhotos } from '@/db/queries/gallery'

/**
 * The widest a cell gets is a quarter of the 1248 px content box less its gutters, so
 * about 294 px; the step above that is never needed.
 */
const SIZES = '(min-width: 1000px) 300px, (min-width: 640px) 33vw, 50vw'

/** The first row is what the LCP measures, so it is the only one not deferred. */
const EAGER = 2

export async function SectionGallery({ section, page }: { section: Section; page: number }) {
  const pages = Math.max(1, Math.ceil(section.photos / PER_PAGE))
  if (page > pages) notFound()
  const photos = await listSectionPhotos(section.slug, page)
  const from = (page - 1) * PER_PAGE + 1

  return (
    <>
      <Link
        href="/#secciones"
        className="t-credit link text-muted hover:text-text focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        ← Índice
      </Link>

      <header className="mt-5">
        <h1 className="t-section">{section.name}</h1>
        <p className="t-meta mt-4 flex flex-wrap gap-x-4 uppercase">
          <span>{section.photos} fotos</span>
          {pages > 1 && (
            <>
              <span>
                página {page} de {pages}
              </span>
              <span>
                {from}–{Math.min(from + PER_PAGE - 1, section.photos)}
              </span>
            </>
          )}
        </p>
        {section.intro && page === 1 && (
          <div className="t-intro text-muted mt-6">
            {section.intro.split('\n\n').map((paragraph, index) => (
              <p key={index} className="mt-3 first:mt-0">
                {paragraph}
              </p>
            ))}
          </div>
        )}
      </header>

      <ul className="wall mt-10 sm:mt-14">
        {photos.map((photo, index) => (
          <WallCell key={photo.slug} photo={photo} priority={page === 1 && index < EAGER} />
        ))}
      </ul>

      {pages > 1 && <Pagination slug={section.slug} page={page} pages={pages} />}
    </>
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
 */
function Pagination({ slug, page, pages }: { slug: string; page: number; pages: number }) {
  const href = (n: number) => (n === 1 ? `/categoria/${slug}` : `/categoria/${slug}/${n}`)
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
    <nav aria-label="Paginación" className="border-rule mt-16 border-t pt-6">
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
