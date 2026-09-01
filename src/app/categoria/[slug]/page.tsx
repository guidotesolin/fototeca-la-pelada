import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { SectionGallery } from '@/components/section-gallery'
import { listSections } from '@/db/queries/gallery'

export const dynamicParams = false

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

export default async function CategoryPage(props: PageProps<'/categoria/[slug]'>) {
  const { slug } = await props.params
  const section = (await listSections()).find((s) => s.slug === slug)
  if (!section) notFound()
  return <SectionGallery section={section} page={1} />
}
