/**
 * Guards for URLs that come out of the database. Every one of these ends up in an
 * `href` or an `src`, and `site_text` is edited from the panel, so this is a trust
 * boundary however friendly the editor. A value that does not pass is not repaired
 * or escaped -- it simply does not render.
 *
 * They run twice, on purpose. `/admin/site-text` puts a typed value through the
 * matching guard **before storing it**, so what is in the database has passed; the
 * public side runs the same guard on the way out, because the rows predate that
 * screen and a database is not only written by one form.
 *
 * The check is an exact hostname match, never `endsWith`: `maps.google.com.evil.com`
 * ends with the right string and is a different site. `new URL` also normalises the
 * cases that fool a naive parser -- userinfo (`https://www.google.com@evil.com/`),
 * a `javascript:` scheme, a protocol-relative `//host`.
 */

/**
 * The site's own origin, and the one place it is read.
 *
 * The fallback is for `next dev` and for a build made without the variable; in
 * production it is what `NEXT_PUBLIC_SITE_URL` says, which is also what the
 * sitemap writes into every one of its addresses. Public by definition -- it is
 * the address readers type -- so the `NEXT_PUBLIC_` prefix costs nothing.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

/**
 * The hosts a Google Maps embed may come from. **Exported because the CSP is
 * built from it**: `frame-src` in `next.config.ts` and this allowlist are the same
 * fact, and two copies of one fact is how one of them goes stale -- a pin moved
 * to a host this list allows and the header does not would render an empty frame
 * and no error anybody would see.
 */
export const MAP_HOSTS = ['maps-api-ssl.google.com', 'maps.google.com', 'www.google.com']

/**
 * The hosts a video embed may come from, exported for exactly the reason
 * `MAP_HOSTS` above is: **`frame-src` in `next.config.ts` is built from this
 * list**, so the allowlist and the header cannot drift into two versions of one
 * fact. `youtube-nocookie.com` rather than `youtube.com`, which is the whole of
 * what the reader gains by us hosting the poster ourselves.
 */
export const VIDEO_HOSTS = ['www.youtube-nocookie.com']

/**
 * A YouTube video id, which is what the archive stores instead of a URL.
 *
 * Eleven characters of base64url, and checked rather than trusted for the same
 * reason `isFileId` in `lib/drive.ts` is: the value arrives from a form and ends
 * up inside an `<iframe src>`. Storing an id and building the address in code
 * means the panel cannot point the frame anywhere -- which is a stronger promise
 * than accepting a URL and sanitising it, because there is nothing left to get
 * wrong.
 */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/

export function isYoutubeId(value: unknown): value is string {
  return typeof value === 'string' && YOUTUBE_ID.test(value)
}

/** The `<iframe src>` on a video's page. `rel=0` keeps the end card off other channels. */
export function videoEmbedUrl(youtubeId: string): string {
  return `https://${VIDEO_HOSTS[0]}/embed/${youtubeId}?rel=0`
}

/**
 * Where the facade's link goes with no JavaScript, and where a middle click goes
 * with it. `youtube.com` and not the nocookie host on purpose: this one is a real
 * navigation the reader chose, so it should land on the page they expect, with the
 * channel and the description around it.
 */
export function videoWatchUrl(youtubeId: string): string {
  return `https://www.youtube.com/watch?v=${youtubeId}`
}

function parse(value: string | undefined): URL | null {
  if (!value) return null
  try {
    const url = new URL(value)
    // https only: an `http` embed would be blocked as mixed content anyway, and a
    // scheme that is neither is how `javascript:` gets in.
    return url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/** For the `<iframe>` on the home page: a Google Maps embed and nothing else. */
export function mapEmbedUrl(value: string | undefined): string | null {
  const url = parse(value)
  return url && MAP_HOSTS.includes(url.hostname) ? url.href : null
}

/**
 * For a link out to one of the archive's own accounts. The host is not pinned: the
 * authors decide where they are, and a new network must not need a deploy. What is
 * pinned is the scheme, which is the part that could execute.
 */
export function externalUrl(value: string | undefined): string | null {
  return parse(value)?.href ?? null
}
