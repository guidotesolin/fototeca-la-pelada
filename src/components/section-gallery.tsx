import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Pagination, PhotoWall } from '@/components/photo-wall'
import { PER_PAGE, type Section, listSectionPhotos } from '@/db/queries/gallery'

export async function SectionGallery({ section, page }: { section: Section; page: number }) {
  const pages = Math.max(1, Math.ceil(section.photos / PER_PAGE))
  if (page > pages) notFound()
  const photos = await listSectionPhotos(section.slug, page)
  const from = (page - 1) * PER_PAGE + 1

  // Page one lives at `/categoria/espacios`; paths, not `?p=2`, so every page of
  // every section prerenders -- see "Pagination" in ARCHITECTURE.
  const href = (n: number) =>
    n === 1 ? `/categoria/${section.slug}` : `/categoria/${section.slug}/${n}`

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

      <PhotoWall photos={photos} eager={page === 1} />

      {pages > 1 && <Pagination href={href} page={page} pages={pages} label="Paginación" />}
    </>
  )
}
