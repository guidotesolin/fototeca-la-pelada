import type { MetadataRoute } from 'next'
import { listPublicPaths } from '@/db/queries/gallery'
import { SITE_URL } from '@/lib/url'
import { defaultLocale, localeHref, locales, type Locale } from '@/i18n/config'

/**
 * What the archive asks Google to fetch.
 *
 * **Only published photographs and visible sections.** `listPublicPaths` is where
 * that filter lives and where the note explaining it sits, next to the two
 * neighbouring queries that deliberately do the opposite for
 * `generateStaticParams`. A hidden photograph's page answers 410 through the
 * proxy, so listing it would be asking a crawler to come and be told the address
 * is dead.
 *
 * **`/buscar` is not here**, and that is _Exposure, indexing and takedown on
 * request_: a result set is not a page of the archive, the page carries
 * `noindex, follow` of its own, and an open search box is unbounded URL space.
 *
 * ### Four entries per address, not one
 *
 * Every address is listed once **per language**, and each of those four entries
 * carries the same five `hreflang` links -- the four languages and `x-default`.
 * That is the shape Google documents for a sitemap: an entry has to name every
 * version *including itself*, and a version that never gets an entry of its own
 * has no return link from the sitemap. The pages already emit the same set in
 * `<head>` through `alternatesFor`, so this is the second half of one fact rather
 * than a second fact -- both are built from `locales` and `localeHref`, which is
 * what stops them disagreeing.
 *
 * It comes to roughly 2,500 entries against Google's 50,000 limit, so
 * `generateSitemaps` is not needed and splitting this would be ceremony.
 *
 * ### No `lastModified`
 *
 * `photo` has no `updated_at`, and adding a column, a migration and a write in
 * every panel action to fill a field Google treats as a hint is not a trade this
 * archive should make. `changeFrequency` and `priority` are left out for the same
 * reason: Google has said publicly it ignores both.
 *
 * ### Rendering
 *
 * A sitemap is a Route Handler and Next caches it like any other, so this is
 * generated at build and refreshed by tag: `listPublicPaths` carries
 * `GALLERY_TAG`, which every panel write revalidates. Unpublishing a photograph
 * drops it from here with the same call that drops it from its gallery.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const paths = await listPublicPaths()
  const url = (locale: Locale, path: string) => new URL(localeHref(locale, path), SITE_URL).href

  return paths.flatMap((path) => {
    const languages = {
      ...Object.fromEntries(locales.map((l) => [l, url(l, path)])),
      'x-default': url(defaultLocale, path),
    }
    return locales.map((locale) => ({ url: url(locale, path), alternates: { languages } }))
  })
}
