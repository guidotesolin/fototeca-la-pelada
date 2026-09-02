import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { SectionGallery } from '@/components/section-gallery'
import { listSections } from '@/db/queries/gallery'
import { isSectionSlug } from '@/lib/slug'

/**
 * **`dynamicParams = true`, and it is what makes a new section work.** Its
 * neighbours under `/foto` are prerendered-only, because the archive's slugs are
 * known at build time and `generateStaticParams` can list every one of them,
 * published or not. A section is not like that: T11 lets the panel create one,
 * and a slug that did not exist when the site was built has no entry in that list
 * and therefore no route -- the panel would report success and `/categoria/<slug>`
 * would answer 404 until somebody deployed, which is the failure T10 measured on
 * `/foto/[slug]` and fixed by listing every photograph. There is no equivalent
 * list to widen here, so the route renders the unknown slug on demand instead: it
 * reads the cached section list, finds it or does not, and caches the answer.
 *
 * It costs nothing the prerendered path was buying. The database stays out of the
 * request path either way -- `listSections()` is an `unstable_cache` tagged
 * `GALLERY_TAG` -- and revalidation gets safer rather than riskier, because a
 * route that can regenerate cannot be left with nothing to serve.
 */
export const dynamicParams = true

export async function generateStaticParams() {
  const sections = await listSections()
  return sections.map((s) => ({ slug: s.slug }))
}

export async function generateMetadata(props: PageProps<'/categoria/[slug]'>): Promise<Metadata> {
  const { slug } = await props.params
  const section = (await listSections()).find((s) => s.slug === slug)
  if (!section) return {}
  return { title: section.name, description: section.intro ?? undefined }
}

/**
 * A slug that cannot be a section's is refused before anything renders. It does
 * not make the route free -- a well-formed invented slug still costs a render and
 * an ISR entry, which is the price of `dynamicParams = true` and what F31's rate
 * limiting is for -- but it keeps the cheapest kind of generated traffic, long or
 * malformed paths, from reaching the page at all.
 */
export default async function CategoryPage(props: PageProps<'/categoria/[slug]'>) {
  const { slug } = await props.params
  if (!isSectionSlug(slug)) notFound()
  const section = (await listSections()).find((s) => s.slug === slug)
  if (!section) notFound()
  return <SectionGallery section={section} page={1} />
}
