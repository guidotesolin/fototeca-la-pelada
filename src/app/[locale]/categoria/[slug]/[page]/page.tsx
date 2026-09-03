import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { SectionGallery } from '@/components/section-gallery'
import { PER_PAGE, countSectionPhotos, listSections } from '@/db/queries/gallery'
import { isSectionSlug } from '@/lib/slug'
import { alternatesFor, isLocale } from '@/i18n/config'

// Same reason as page one next door: a section created from the panel has no
// entry in the build-time list, so its pages render on demand.
export const dynamicParams = true

/**
 * Page one lives at `/categoria/espacios`; this covers two and up. Paths rather
 * than `?p=2` so the pages prerender and the database stays out of the request
 * path -- see "Pagination" in ARCHITECTURE. A `?p=2` would read `searchParams`,
 * which is a request-time API and cannot be prerendered at all.
 */
/**
 * Counted over **every** photograph in the section, published or not, so that the
 * pages a section is going to need are prerendered rather than left to render on
 * the first click: publishing the 25th photograph of a section makes the gallery
 * draw "Siguiente →", and counting only the published ones meant that page had no
 * entry here. The extra pages render, find nothing published and are `notFound()`
 * until they fill up.
 *
 * The counts are language-independent, so this list is the same for all four and
 * Next runs it once per locale.
 */
export async function generateStaticParams() {
  const counts = await countSectionPhotos()
  return (await listSections('es')).flatMap((s) =>
    Array.from({ length: Math.ceil((counts[s.slug] ?? s.photos) / PER_PAGE) - 1 }, (_, i) => ({
      slug: s.slug,
      page: String(i + 2),
    })),
  )
}

export async function generateMetadata(
  props: PageProps<'/[locale]/categoria/[slug]/[page]'>,
): Promise<Metadata> {
  const { locale, slug, page } = await props.params
  if (!isLocale(locale)) return {}
  const [sections, t] = await Promise.all([
    listSections(locale),
    getTranslations({ locale, namespace: 'gallery' }),
  ])
  const section = sections.find((s) => s.slug === slug)
  if (!section) return {}
  return {
    title: t('pageTitle', { name: section.name, page }),
    alternates: alternatesFor(locale, `/categoria/${slug}/${page}`),
  }
}

export default async function CategoryPaged(props: PageProps<'/[locale]/categoria/[slug]/[page]'>) {
  const { locale, slug, page } = await props.params
  // Same guard as page one next door, and the page number is its own: neither
  // reaches a query before it is a shape this route could ever have.
  if (!isLocale(locale) || !isSectionSlug(slug) || !/^[1-9][0-9]{0,4}$/.test(page)) notFound()
  const section = (await listSections(locale)).find((s) => s.slug === slug)
  const n = Number(page)
  if (!section || n < 2) notFound()
  return <SectionGallery section={section} page={n} locale={locale} />
}
