import createNextIntlPlugin from 'next-intl/plugin'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // The stylesheet costs a whole round trip before anything paints, and at the
    // latencies this archive is read over that is most of the first paint. Next's
    // own guidance for this flag is atomic CSS plus first-time visitors, which is
    // exactly here: Tailwind, and readers arriving once from a shared link.
    // ponytail: experimental flag. If it is ever dropped, the cost is one round trip.
    inlineCss: true,

    /**
     * The panel uploads a restoration through a server action, and the default
     * body limit for one is 1 MB -- under what a retouched scan of a 2340 px
     * photograph weighs. Four, because that is the last round number under the
     * 4.5 MB request body a serverless function accepts on Vercel: anything
     * larger fails at the platform whatever is written here.
     *
     * ponytail: the ceiling is the request, not the encoder -- `lib/images.ts`
     * accepts 40 MB, which only the Drive import in T12 can reach. The way past
     * it for uploads is a presigned PUT straight to R2, which is what Next's own
     * guidance recommends and costs a client component this panel does not have.
     */
    serverActions: { bodySizeLimit: '4mb' },
  },

  /**
   * `/buscar` is the one route rendered per request -- it reads `searchParams`,
   * which Next 16 documents as a request-time API.
   *
   * **It is no longer cached at the CDN, and T10 is why.** The hour of `s-maxage`
   * this used to carry was bought to keep Neon out of the request path, and the
   * price only became clear once the panel could take a photograph down:
   * `revalidateTag` cannot reach a CDN entry for a route that is not ISR, so a
   * withdrawn photograph's caption and credit -- the research text that names
   * living people -- went on being served from cached search results for an hour
   * fresh and a day stale, on the one public route the 410 does not cover.
   *
   * Neon is protected anyway, and by the layer that can be invalidated: the query
   * behind this page is an `unstable_cache` tagged `GALLERY_TAG`, so two people
   * searching the same words still reach the database once, and a takedown drops
   * that entry with every other. What the CDN entry was saving was a function
   * invocation, which is not worth a promise the archive makes to a neighbour.
   *
   * Matched on the **incoming** path, which is why the prefixed languages need a
   * source of their own: the proxy's rewrite to `/es/buscar` happens after this.
   */
  async headers() {
    return [
      {
        source: '/:path(buscar|en/buscar|fr/buscar|it/buscar)',
        headers: [{ key: 'Cache-Control', value: 'private, no-store' }],
      },
    ]
  },
}

/**
 * The plugin aliases `next-intl/config` to `src/i18n/request.ts`, which is where
 * the message files are read. Nothing else about the build changes.
 */
export default createNextIntlPlugin()(nextConfig)
