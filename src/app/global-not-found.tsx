import type { Metadata } from 'next'
import { Document } from '@/components/document'
import { NotFoundMount, notFoundLocale, notFoundMetadata } from '@/components/not-found-mount'

/**
 * The 404 for an address the route tree never matched: `/adsaddsa`, which the
 * proxy rewrites to `/es/adsaddsa` because the first segment is not a language and
 * which nothing under `[locale]` answers, `/es/a/b/c`, `/admin/nada`. Every one of
 * them used to arrive at Next's own bare fallback -- "This page could not be
 * found" on a white ground, in a font the archive does not use.
 *
 * **`global-not-found.tsx` and not `not-found.tsx`, because of the shape of this
 * app.** Next's documentation names the two traits that make a root
 * `not-found.tsx` insufficient, and this project has both: several root layouts
 * (`[locale]` and `/admin`), and a root layout under a dynamic segment. With
 * neither a layout nor a page to compose from, Next answers an unmatched address
 * at the routing level, and this is the file it answers with. It is skipped
 * entirely by the rendering pipeline, so it brings its own document -- which is
 * `Document`, the same one both root layouts use, so the ground, the grain, the
 * fonts and `lang` are the archive's and not a copy of them.
 *
 * Measured on the production build, which is the only place the old fallback was
 * visible: `<html lang="es">`, the stylesheet inlined, and the page in the HTML
 * rather than in a payload the client has to paint.
 *
 * No header and no footer, and that is a decision as much as a constraint: they
 * are three database reads and a locale this address does not have. A typo or a
 * crawler is not a page of the archive.
 *
 * ponytail: `experimental.globalNotFound` in `next.config.ts`. If the flag is ever
 * dropped, this file stops being read and unmatched addresses fall back to
 * `app/not-found.tsx` -- the design, without `lang` and inside Next's own bare
 * document.
 */
export async function generateMetadata(): Promise<Metadata> {
  return notFoundMetadata()
}

export default async function GlobalNotFound() {
  const locale = await notFoundLocale()

  return (
    <Document lang={locale}>
      {/* Centred in the viewport rather than sitting under a header that is not
          there: the mount is the only thing on the page. */}
      <main className="max-w-content mx-auto flex w-full flex-1 items-center px-4 py-10 sm:px-6 sm:py-16">
        <NotFoundMount locale={locale} />
      </main>
    </Document>
  )
}
