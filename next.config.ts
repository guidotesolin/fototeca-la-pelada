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
}

export default nextConfig
