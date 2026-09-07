import '@/app/globals.css'
import type { Metadata } from 'next'
import { FONT_VARIABLES } from '@/components/document'
import { NotFoundMount, notFoundLocale, notFoundMetadata } from '@/components/not-found-mount'

/**
 * The last of the three, and the one nobody is meant to reach: a `notFound()`
 * raised by a **root layout**, which is above every boundary inside it.
 *
 * `[locale]/layout.tsx` calls it for a first segment that is not a language, and
 * the proxy rewrites those to `/es/<segment>` before Next sees them -- so this
 * road is only open where the proxy's matcher is not: an address with a dot in it,
 * `/foo.php` or `/album.jpg`, which matches `[locale]` with a locale that is not
 * one. `global-not-found.tsx` cannot answer it, because the route did match.
 *
 * **No `Document` here, and that is measured rather than assumed.** With no layout
 * at this layer Next renders the file inside a bare document of its own, so a
 * `<Document>` produced `<html>` nested in `<body>`: invalid, and the browser drops
 * the inner element's `lang` and font classes on the floor. So the page is the
 * content only, and the font variables ride the wrapper -- `globals.css` sets
 * `font-family` on `body`, which is above the wrapper and out of reach, which is
 * why `font-serif` is declared here too.
 *
 * A `notFound()` thrown on a dynamically rendered route answers 404 with an empty
 * `<html id="__next_error__">` shell and the page in the RSC payload -- the client
 * paints it. That is Next's own behaviour for every thrown 404 in this app,
 * `[locale]/not-found.tsx` included, and it is the reason this file does not try
 * to be a whole document: nothing it renders reaches the first paint anyway.
 */
export async function generateMetadata(): Promise<Metadata> {
  return notFoundMetadata()
}

export default async function NotFound() {
  return (
    <div
      className={`${FONT_VARIABLES} grid min-h-screen place-items-center px-4 py-10 font-serif sm:px-6`}
    >
      <NotFoundMount locale={await notFoundLocale()} />
    </div>
  )
}
