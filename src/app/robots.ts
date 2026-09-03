import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/url'

/**
 * An open archive, which is the decision in _Exposure, indexing and takedown on
 * request_: everything public is crawlable, because that is what lets a
 * descendant in Italy find their great-grandfather. Two prefixes are not.
 *
 * - `/admin` is the panel. Every screen under it is behind `requireAdmin()`
 *   already, so this saves a crawler the walk rather than protecting anything --
 *   robots.txt is a request, never a boundary.
 * - `/api` is machinery. `/api/gone` already answers `X-Robots-Tag: noindex` on
 *   its own, for the same reason: this file is not what keeps it out of the index.
 *
 * **`/buscar` is deliberately allowed**, and that is the subtle one. It carries
 * `noindex, follow` in its own metadata, and a crawler has to be allowed to
 * *fetch* the page to read that -- disallowing it here would hide the `noindex`
 * and leave Google free to index the address anyway from links pointing at it.
 * `follow` is the other half: the results are a path to photographs that should
 * be indexed.
 *
 * `/idioma/<code>` is left alone too. Its links are `rel="nofollow"`, it answers
 * a 307 `no-store` to a page that is already in the sitemap, and a rule for it
 * would be a line to keep true for no gain.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
