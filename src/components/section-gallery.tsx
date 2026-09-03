import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Pagination, PhotoWall } from '@/components/photo-wall'
import { PER_PAGE, type Section, listSectionPhotos } from '@/db/queries/gallery'
import { localeHref, type Locale } from '@/i18n/config'

export async function SectionGallery({
  section,
  page,
  locale,
}: {
  section: Section
  page: number
  locale: Locale
}) {
  const pages = Math.max(1, Math.ceil(section.photos / PER_PAGE))
  if (page > pages) notFound()
  const [photos, t] = await Promise.all([
    listSectionPhotos(locale, section.slug, page),
    getTranslations({ locale, namespace: 'gallery' }),
  ])
  const from = (page - 1) * PER_PAGE + 1

  // Page one lives at `/categoria/espacios`; paths, not `?p=2`, so every page of
  // every section prerenders -- see "Pagination" in ARCHITECTURE.
  const href = (n: number) =>
    localeHref(locale, n === 1 ? `/categoria/${section.slug}` : `/categoria/${section.slug}/${n}`)

  return (
    <>
      <Link
        href={localeHref(locale, '/#secciones')}
        className="t-credit link text-muted hover:text-text focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        ← {t('index')}
      </Link>

      <header className="mt-5">
        {/* The section's own name, in the reader's language when it has been
            translated and in Spanish when it has not: the query coalesces the two,
            so nothing here needs to know which of them it got. */}
        <h1 className="t-section">{section.name}</h1>
        <p className="t-meta mt-4 flex flex-wrap gap-x-4 uppercase">
          <span>{t('photos', { count: section.photos })}</span>
          {pages > 1 && (
            <>
              <span>{t('page', { page, pages })}</span>
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

      <PhotoWall photos={photos} locale={locale} eager={page === 1} />

      {pages > 1 && (
        <Pagination href={href} page={page} pages={pages} label={t('pagination')} locale={locale} />
      )}
    </>
  )
}
