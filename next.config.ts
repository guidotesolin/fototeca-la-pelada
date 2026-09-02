import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // The stylesheet costs a whole round trip before anything paints, and at the
    // latencies this archive is read over that is most of the first paint. Next's
    // own guidance for this flag is atomic CSS plus first-time visitors, which is
    // exactly here: Tailwind, and readers arriving once from a shared link.
    // ponytail: experimental flag. If it is ever dropped, the cost is one round trip.
    inlineCss: true,
  },

  /**
   * `/buscar` is the one route rendered per request -- it reads `searchParams`,
   * which Next 16 documents as a request-time API -- and Next puts
   * `private, no-cache, no-store` on a dynamically rendered page. So the CDN gets
   * told here instead: results are identical for every reader, and a query that
   * two people send in the same hour should reach Neon once.
   *
   * An hour, not a day: `revalidateTag` cannot reach a CDN entry for a route that
   * is not ISR, so this window is how long a caption fixed in the panel can take
   * to show up in search. `stale-while-revalidate` keeps the page instant while
   * that happens.
   */
  async headers() {
    return [
      {
        source: '/buscar',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=3600, stale-while-revalidate=86400' },
        ],
      },
    ]
  },
}

export default nextConfig
