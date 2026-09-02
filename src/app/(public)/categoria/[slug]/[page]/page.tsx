import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { SectionGallery } from '@/components/section-gallery'
import { PER_PAGE, listSections } from '@/db/queries/gallery'

export const dynamicParams = false

/**
 * Page one lives at `/categoria/espacios`; this covers two and up. Paths rather
 * than `?p=2` so every page is prerendered and the database stays out of the
 * request path -- see "Pagination" in ARCHITECTURE.
 */
export async function generateStaticParams() {
  const sections = await listSections()
  return sections.flatMap((s) =>
    Array.from({ length: Math.ceil(s.photos / PER_PAGE) - 1 }, (_, i) => ({
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
