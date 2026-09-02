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

const MAP_HOSTS = ['maps-api-ssl.google.com', 'maps.google.com', 'www.google.com']

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
