import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { SectionGallery } from '@/components/section-gallery'
import { PER_PAGE, countSectionPhotos, listSections } from '@/db/queries/gallery'
import { isSectionSlug } from '@/lib/slug'

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
 */
export async function generateStaticParams() {
  const counts = await countSectionPhotos()
  return (await listSections()).flatMap((s) =>
    Array.from({ length: Math.ceil((counts[s.slug] ?? s.photos) / PER_PAGE) - 1 }, (_, i) => ({
      slug: s.slug,
      page: String(i + 2),
    })),
  )
}

export async function generateMetadata(
  props: PageProps<'/categoria/[slug]/[page]'>,
): Promise<Metadata> {
  const { slug, page } = await props.params
  const section = (await listSections()).find((s) => s.slug === slug)
  if (!section) return {}
  return { title: `${section.name}, página ${page}` }
}

export default async function CategoryPaged(props: PageProps<'/categoria/[slug]/[page]'>) {
  const { slug, page } = await props.params
  // Same guard as page one next door, and the page number is its own: neither
  // reaches a query before it is a shape this route could ever have.
  if (!isSectionSlug(slug) || !/^[1-9][0-9]{0,4}$/.test(page)) notFound()
  const section = (await listSections()).find((s) => s.slug === slug)
  const n = Number(page)
  if (!section || n < 2) notFound()
  return <SectionGallery section={section} page={n} />
}
