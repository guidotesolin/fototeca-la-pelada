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
