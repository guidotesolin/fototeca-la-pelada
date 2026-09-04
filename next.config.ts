import createNextIntlPlugin from 'next-intl/plugin'
import type { NextConfig } from 'next'
import { MAP_HOSTS, VIDEO_HOSTS } from './src/lib/url'

/**
 * Where the archive's images come from, and the only non-`'self'` source the
 * public site is allowed. Read from the same variable the `<img>` tags are built
 * from, so the header follows the bucket: `pub-….r2.dev` today and
 * `img.fototecalapelada.com.ar` once T14's DNS exists, with no second place to
 * remember. Empty in a build made without it, which drops the source rather than
 * emitting a malformed directive.
 */
const IMAGE_ORIGIN = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''

/**
 * Drive's own thumbnails, in the import picker and nowhere else.
 *
 * A wildcard rather than the `lh3.` the code comment names, and deliberately:
 * Drive hands out `thumbnailLink` on whichever `googleusercontent.com` host it
 * feels like, and a pinned subdomain would break the picker one day with an
 * empty square and no error anybody would look for. It is Google's user-content
 * CDN, it is `img-src` only, and it is scoped to `/admin`, which is behind the
 * allowlist.
 */
const DRIVE_THUMBNAILS = 'https://*.googleusercontent.com'

const dev = process.env.NODE_ENV === 'development'

/**
 * The Content-Security-Policy, and the two places it is honest about what it
 * cannot do.
 *
 * **`script-src` carries `'unsafe-inline'`, and that is a decision rather than an
 * oversight.** Next's own CSP guide offers exactly two shapes. The nonce one is
 * generated in the proxy and read with `headers()`, which its own documentation
 * says forces **dynamic rendering on every page** -- that is the whole
 * pre-rendered archive rendered per request, which is the one cross-cutting
 * decision this project rests on, traded for a header. The other is
 * `script-src 'self' 'unsafe-inline'` set here, which is what this is. The third
 * option, `experimental.sri`, would be a third experimental flag and still would
 * not cover the archive's own inline script -- the one in the public layout that
 * puts `show-sensitive` on `<html>` before first paint, which exists precisely so
 * that no round trip happens before the veil is decided.
 *
 * What is left is worth having and worth stating: no external script host, no
 * `eval` in production, no plugins, no framing, no form posting anywhere but here
 * and Google's sign-in, and images only from the archive's own bucket. The XSS
 * `'unsafe-inline'` gives up on is also the one this site has the least of --
 * nothing renders user HTML, React escapes every string, and the two fields that
 * reach an `href` or an `<iframe src>` go through `src/lib/url.ts` first.
 *
 * ponytail: `'unsafe-inline'` on scripts. The way out is a nonce, and its price is
 * the pre-rendering; revisit if Next ever applies a nonce without opting the page
 * out of static generation.
 *
 * **`style-src` carries it too**, for two reasons that are not going away:
 * `experimental.inlineCss` turns every stylesheet into a `<style>` tag on
 * purpose, and React writes `style` attributes for the per-photo `aspect-ratio`
 * that keeps CLS at zero.
 *
 * `'unsafe-eval'` is added in development only, which is Next's own instruction:
 * React evaluates server error stacks with it, and `next dev` is unusable without.
 */
function csp(images: string[] = []): string {
  return [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    // Google's is here because a form post that ends in a redirect is checked
    // against this directive by some browsers, and the panel's sign-in is exactly
    // that: a POST to `/api/auth/signin/google` answered with a 302 to Google.
    "form-action 'self' https://accounts.google.com",
    `img-src ${["'self'", 'data:', IMAGE_ORIGIN, ...images].filter(Boolean).join(' ')}`,
    // `next/font/google` downloads the files at build time and serves them from
    // `/_next/static/media`, so the archive needs no Google font host at all --
    // checked against the build rather than assumed.
    "font-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
    "connect-src 'self'",
    // The map on the home page and the Videoteca's players, each from the same
    // allowlist its own guard in `src/lib/url.ts` enforces. Two lists and one
    // directive, never a host written out here: a copy of an allowlist is how the
    // header and the code that builds a URL end up disagreeing, and that failure
    // is silent -- an empty frame and no error anybody would go looking for.
    `frame-src ${[...MAP_HOSTS, ...VIDEO_HOSTS].map((host) => `https://${host}`).join(' ')}`,
  ].join('; ')
}

/**
 * The rest of the set. Nothing speculative: each one closes something this site
 * actually has.
 *
 * - **HSTS** without `preload`. The list is a one-way door -- getting off it takes
 *   months -- and a year of `max-age` on the apex plus `img.` is the whole of what
 *   the archive needs. Ignored over plain http, so `npm run start` is unaffected.
 * - **`X-Frame-Options`** is `frame-ancestors` again, for the browsers that do not
 *   have it. That is not theoretical here: _Mobile first_ is written for old
 *   embedded WebViews, which is where this header is the only one that lands.
 * - **`Permissions-Policy`** turns off what the archive never asks for. A reader
 *   looking at their grandmother's photograph should not be a browsing-topics
 *   sample either, which is the same instinct as the site setting no cookie.
 */
const SECURITY_HEADERS = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  },
]

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
   *
   * ### The security headers, added in T14
   *
   * `'/:path*'` and not `'/(.*)'`: `*` is zero-or-more, so this one also matches
   * `/` itself. They are set here rather than in `proxy.ts` because Next's own
   * documentation calls `NextResponse.next({ headers })` bad practice -- it can
   * override `Content-Type` and break Server Actions and streaming -- and because
   * headers set here are applied before the filesystem, so a pre-rendered page
   * served straight from the CDN carries them too. Which is most of this site.
   *
   * The `/admin` entry comes **after** the general one on purpose: when two rules
   * set the same header key the last match wins, so the panel gets the same policy
   * with Drive's thumbnail host added and nothing else. Verified against a running
   * build rather than trusted -- see T14's notes in ARCHITECTURE.
   */
  async headers() {
    return [
      {
        source: '/:path(buscar|en/buscar|fr/buscar|it/buscar)',
        headers: [{ key: 'Cache-Control', value: 'private, no-store' }],
      },
      {
        source: '/:path*',
        headers: [{ key: 'Content-Security-Policy', value: csp() }, ...SECURITY_HEADERS],
      },
      {
        source: '/admin/:path*',
        headers: [{ key: 'Content-Security-Policy', value: csp([DRIVE_THUMBNAILS]) }],
      },
    ]
  },
}

/**
 * The plugin aliases `next-intl/config` to `src/i18n/request.ts`, which is where
 * the message files are read. Nothing else about the build changes.
 */
export default createNextIntlPlugin()(nextConfig)
