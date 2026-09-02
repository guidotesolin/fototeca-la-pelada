import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * The 410, and the only reason this file exists.
 *
 * _Exposure, indexing and takedown on request_ requires that an unpublished
 * photograph's page answer **410 Gone**, not 404: 410 is what tells a search
 * engine the address is not coming back, which is the difference between a
 * takedown and a broken link. In Next 16 a page cannot choose its status code --
 * `notFound()` gives 404, `forbidden()` and `unauthorized()` give 403 and 401,
 * and there is nothing else -- and a `route.ts` cannot sit at the same path as a
 * `page.tsx`. F29 offered two ways out and neither exists; the proxy is the one
 * place in the framework that can put an arbitrary status on a URL.
 *
 * T9 decided against a `proxy.ts` for **authentication**, and that still holds:
 * this one carries no authorization, reads no session and guards nothing. It
 * answers one question about one route.
 *
 * What it must not do is put Neon back in the request path, which is the
 * cross-cutting decision the whole pre-rendered site rests on. So the list comes
 * from `/api/gone`, whose own read is cached and tagged, and Neon is touched only
 * when a takedown actually changes it.
 *
 * ### What this costs, measured
 *
 * This proxy runs on every `/foto/:slug` request, including prefetches -- and a
 * gallery prefetches its whole page of photographs. Measured on the production
 * build, five cold starts each:
 *
 * | | TTFB |
 * | --- | --- |
 * | `/foto/[slug]`, cold instance, first request | 191 ms |
 * | `/categoria/[slug]`, cold, no proxy on the route | 76 ms |
 * | either one, warm | 8-11 ms |
 *
 * So the list costs ~115 ms once per instance and nothing afterwards, and the
 * first measurement of this file was much worse than that: 24 concurrent
 * requests from a cold start produced **24 separate fetches** of the same list,
 * which is exactly the shape of a gallery being prefetched. `refresh()` now
 * collapses them into one.
 *
 * The remaining ~115 ms is deliberate. Passing through while the list loads in
 * the background would take the fetch off the critical path completely, and it
 * was rejected: on an archive this quiet most requests arrive at a cold
 * instance, so the answer would almost always be the empty list and the 410
 * would essentially never fire. Blocking once per instance is what makes the
 * feature real.
 *
 * ponytail: an in-process memo, so a takedown reaches an instance up to
 * `MEMO_MS` late (F37) -- the files are deleted long before the page stops
 * being served. Anything fresher means a lookup per request; the way out is a
 * store the panel writes and the proxy reads in a microsecond, which is a
 * dependency this project does not have.
 */

/**
 * How long a request may be answered from a list that was already read.
 *
 * Two seconds, and it was ten until the windows were measured. The memo is what
 * bounds them both, and neither is only about a status code:
 *
 * - After a takedown, until the memo catches up, the photograph's page is still
 *   the pre-rendered one -- **200, with the caption on it**. The image is already
 *   dead, but the caption is the part that names living people.
 * - After republishing, until the memo catches up, a photograph that is back
 *   answers 410, which tells a crawler it is never coming back. The check
 *   before the 410 at the foot of `proxy` closes that one entirely; the memo
 *   only bounds the first.
 *
 * A refresh never blocks a reader (see `proxy`), collapses across concurrent
 * requests, and does not reach Neon unless a takedown actually changed the list,
 * so a shorter memo costs invocations proportional to traffic and nothing else.
 */
const MEMO_MS = 2_000

/** A takedown list that will not answer must not hold up the archive behind it. */
const REFRESH_TIMEOUT_MS = 1_500

let memo: { at: number; slugs: Set<string> } | null = null

/** The refresh in flight, so a page of prefetches asks once between them. */
let refreshing: Promise<void> | null = null

function refresh(origin: string): Promise<void> {
  refreshing ??= fetch(`${origin}/api/gone`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`/api/gone answered ${response.status}`)
      const slugs: unknown = await response.json()
      // `new Set(null)` is an empty set and `new Set('campo-078')` is a set of
      // letters: either would install a wrong list and never say so.
      if (!Array.isArray(slugs)) throw new Error('/api/gone did not answer with a list')
      memo = { at: Date.now(), slugs: new Set(slugs.map(String)) }
    })
    .catch((error) => {
      /**
       * Fails open, and that is the right direction: the photograph is already
       * out of the galleries and its files are already deleted, so the worst
       * case is a 404 where a 410 belonged. Failing closed would 410 the whole
       * archive. The empty memo is what stops every following request from
       * blocking on the same broken endpoint -- it retries after `MEMO_MS`.
       */
      console.error('[proxy] could not read the takedown list:', error)
      // A fresh stamp, not `??=`: keeping the old one leaves the memo permanently
      // stale, so every request -- a gallery's whole prefetch burst included --
      // would start its own fetch at a broken endpoint instead of one per window.
      // The slugs already known are kept, because they are still the best answer.
      memo = { at: Date.now(), slugs: memo?.slugs ?? new Set() }
    })
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

/** Plain and self-contained: the page's own chrome is three database reads away. */
function gonePage(): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Fotografía retirada · Fototeca La Pelada</title>
<style>
  html { color-scheme: dark }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 2rem;
         background: #1B1917; color: #EDE6DA;
         font: 400 19px/1.5 Georgia, 'Times New Roman', serif }
  main { max-width: 46ch; text-align: center }
  p { margin: 0 0 1.5rem }
  a { color: #C9954E }
</style>
</head>
<body>
<main>
  <p>Esta fotografía fue retirada del archivo.</p>
  <p><a href="/">Ir al archivo</a></p>
</main>
</body>
</html>
`
}

/**
 * Next matches the route on the decoded path, so the takedown list has to be read
 * the same way: `/foto/%63ampo-078` is `/foto/campo-078` to everything downstream,
 * and comparing the raw segment lets an encoded spelling walk past the 410.
 * A malformed escape is not a slug, so it decodes to nothing and passes through.
 */
function slugOf(pathname: string): string {
  const raw = pathname.slice('/foto/'.length)
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export async function proxy(request: NextRequest) {
  const slug = slugOf(request.nextUrl.pathname)
  const origin = request.nextUrl.origin
  let settled: Promise<void> | null = null
  let list = memo

  if (!list || Date.now() - list.at >= MEMO_MS) {
    settled = refresh(origin)
    // Only the very first request on an instance waits. Once there is a list, a
    // stale one answers now and the new one arrives behind it, so no reader pays
    // for a refresh they did not ask for.
    if (!list) {
      await settled
      list = memo
    }
  }

  if (!list?.slugs.has(slug)) return NextResponse.next()

  /**
   * The list says this photograph is gone, and 410 is the one answer that cannot
   * be taken back -- it tells a search engine the address is finished. So a stale
   * list does not get to say it: a photograph republished a moment ago would
   * otherwise be declared permanently gone for as long as the memo lasts.
   *
   * This costs a blocking refresh, and it is charged only to requests for
   * photographs the archive has already taken down, which are rare and are not
   * the ones the LCP budget is written for.
   */
  if (settled) {
    // The same refresh already in flight, not a second one.
    await settled
    if (!memo?.slugs.has(slug)) return NextResponse.next()
  }

  return new NextResponse(gonePage(), {
    status: 410,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/** Only the photograph pages. Every other route pays nothing for this. */
export const config = { matcher: '/foto/:slug' }
