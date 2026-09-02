import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { SectionGallery } from '@/components/section-gallery'
import { PER_PAGE, countSectionPhotos, listSections } from '@/db/queries/gallery'

export const dynamicParams = false

/**
 * Page one lives at `/categoria/espacios`; this covers two and up. Paths rather
 * than `?p=2` so every page is prerendered and the database stays out of the
 * request path -- see "Pagination" in ARCHITECTURE.
 */
/**
 * Counted over **every** photograph in the section, published or not. The params
 * are fixed at build time and this route is `dynamicParams = false`, so counting
 * only the published ones means publishing the 25th photograph of a section makes
 * the gallery render "Siguiente →" to a page that has no route and answers 404
 * until somebody deploys. The extra pages render, find nothing published and are
 * `notFound()` until they fill up.
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
  const section = (await listSections()).find((s) => s.slug === slug)
  const n = Number(page)
  if (!section || !Number.isInteger(n) || n < 2) notFound()
  return <SectionGallery section={section} page={n} />
}
