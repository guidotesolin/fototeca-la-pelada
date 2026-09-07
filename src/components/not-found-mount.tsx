import Link from 'next/link'
import { locale as localeParam } from 'next/root-params'
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { defaultLocale, isLocale, localeHref } from '@/i18n/config'
import type { Locale } from '@/i18n/config'

/**
 * The 404, once, for the two files that have to render it.
 *
 * There are two, because a 404 arrives here by two different roads and the
 * framework answers them at two different layers:
 *
 * - **`app/[locale]/not-found.tsx`** catches a `notFound()` thrown by a page of
 *   the archive -- a mistyped permalink, a gallery page past the end -- and
 *   renders inside the public layout, so the reader keeps the header, the footer
 *   and their own language.
 * - **`app/not-found.tsx`** catches everything the route tree never matched:
 *   `/adsaddsa`, which the proxy rewrites to `/es/adsaddsa` and nothing answers.
 *   That is the layer *above* both root layouts, so it renders with no layout at
 *   all and has to bring its own `<html>`.
 *
 * Neither is reachable from the other, and the second one was the bare
 * `<html id="__next_error">` until it existed. So the page itself lives here and
 * both files are three lines: one design, whichever road the reader took.
 */

/**
 * The reader's language, and Spanish wherever the URL does not say.
 *
 * `next/root-params` and not `params`, because a `not-found.tsx` gets none: that
 * is exactly what root params are for -- `[locale]` sits above the root layout, so
 * its value is readable from any Server Component without prop drilling. It is
 * typed `string | undefined` because there are two root layouts and only one of
 * them has the segment, which is also the honest answer for an address that
 * matched no route at all: there is no locale in `/adsaddsa` to read.
 */
export async function notFoundLocale(): Promise<Locale> {
  const asked = await localeParam()
  return isLocale(asked) ? asked : defaultLocale
}

/** Never indexed: it is not a page of the archive, it is the absence of one. */
export async function notFoundMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await notFoundLocale(), namespace: 'notFound' })
  return { title: t('title'), robots: { index: false, follow: true } }
}

/**
 * The footer's mount, with nothing in it: four paper corners holding a recess in
 * the ground colour where a copy should be, the code stamped inside it in the
 * hairline's own colour, and the catalogue's words under that. The archive already
 * has a way of showing a photograph -- a print sunk into board -- so the absence
 * of one is the same object emptied, which says it without a sentence. `.album`,
 * its corners and its accent rule are the footer's; `.album-gap` is the one rule
 * this page added.
 *
 * Centred, and the column is what centres it: `.album-rule` carries `margin: 20px 0`
 * as unlayered author CSS, which beats an `mx-auto` utility in `@layer utilities`
 * -- the same cascade-layer trap `body > header` and the pagination marker are
 * commented for. `items-center` never meets that rule, so the hairline lands under
 * the middle of the sentence and nothing has to be overridden. The recess takes
 * `w-full` back, because a flex item that is centred no longer stretches.
 */
export async function NotFoundMount({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'notFound' })

  return (
    <section className="album mx-auto flex max-w-[560px] flex-col items-center text-center">
      <span className="album-corner album-corner-tl" />
      <span className="album-corner album-corner-tr" />
      <span className="album-corner album-corner-bl" />
      <span className="album-corner album-corner-br" />

      {/* `aria-hidden` on the figure: the heading below carries the fact, and a
          screen reader reading "404" out of an empty frame says nothing the
          sentence does not. See the contrast note in globals.css. */}
      <div className="album-gap w-full">
        <p className="album-gap-number" aria-hidden>
          404
        </p>
        <p className="t-label mt-4">{t('label')}</p>
      </div>

      <div className="album-rule" />
      <h1 className="t-section">{t('title')}</h1>
      <p className="t-intro text-muted mt-5">{t('body')}</p>
      <Link
        href={localeHref(locale, '/')}
        className="t-credit link hover:text-focus focus-visible:outline-focus mt-8 inline-block underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {t('back')}
      </Link>
    </section>
  )
}
