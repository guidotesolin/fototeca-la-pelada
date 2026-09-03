import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { SectionGallery } from '@/components/section-gallery'
import { listSections } from '@/db/queries/gallery'
import { isSectionSlug } from '@/lib/slug'
import { alternatesFor, isLocale } from '@/i18n/config'

/**
 * **`dynamicParams = true`, and it is what makes a new section work.** T11 lets
 * the panel create one, and a slug that did not exist when the site was built has
 * no entry in `generateStaticParams` and therefore no pre-rendered page -- with
 * `false` the panel would report success and `/categoria/<slug>` would answer 404
 * until somebody deployed. So the route renders the unknown slug on demand
 * instead: it reads the cached section list, finds it or does not, and caches the
 * answer.
 *
 * It costs nothing the prerendered path was buying. The database stays out of the
 * request path either way -- `listSections()` is an `unstable_cache` tagged
 * `GALLERY_TAG` -- and revalidation gets safer rather than riskier, because a
 * route that can regenerate cannot be left with nothing to serve.
 */
export const dynamicParams = true

/**
 * Eleven sections in each of four languages: 44 pages, which is the cheap half of
 * the archive and the half readers arrive at. `/foto/[slug]` is the one that does
 * not multiply -- see its own note.
 */
export async function generateStaticParams() {
  const sections = await listSections('es')
  return sections.map((s) => ({ slug: s.slug }))
}

export async function generateMetadata(
  props: PageProps<'/[locale]/categoria/[slug]'>,
): Promise<Metadata> {
  const { locale, slug } = await props.params
  if (!isLocale(locale)) return {}
  const section = (await listSections(locale)).find((s) => s.slug === slug)
  if (!section) return {}
  return {
    title: section.name,
    description: section.intro ?? undefined,
    alternates: alternatesFor(locale, `/categoria/${slug}`),
  }
}

/**
 * A slug that cannot be a section's is refused before anything renders. It does
 * not make the route free -- a well-formed invented slug still costs a render and
 * an ISR entry, which is the price of `dynamicParams = true` and what F31's rate
 * limiting is for -- but it keeps the cheapest kind of generated traffic, long or
 * malformed paths, from reaching the page at all.
 */
export default async function CategoryPage(props: PageProps<'/[locale]/categoria/[slug]'>) {
  const { locale, slug } = await props.params
  if (!isLocale(locale) || !isSectionSlug(slug)) notFound()
  const section = (await listSections(locale)).find((s) => s.slug === slug)
  if (!section) notFound()
  return <SectionGallery section={section} page={1} locale={locale} />
}
