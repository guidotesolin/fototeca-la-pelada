import Link from 'next/link'
import { headers } from 'next/headers'
import { locale as localeParam } from 'next/root-params'
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { defaultLocale, isLocale, localeHref } from '@/i18n/config'
import type { Locale } from '@/i18n/config'

/**
 * The 404, once, for the two files that have to render it.
 *
 * There are three, because a 404 arrives by three roads and the framework answers
 * each at a different layer:
 *
 * - **`app/[locale]/not-found.tsx`** catches a `notFound()` thrown by a page of
 *   the archive -- a mistyped permalink, a gallery page past the end -- and
 *   renders inside the public layout, so the reader keeps the header, the footer
 *   and their own language.
 * - **`app/global-not-found.tsx`** catches every address the route tree never
 *   matched, which is most of them: `/adsaddsa`, `/en/vzcxz`, `/admin/nada`.
 * - **`app/not-found.tsx`** catches what is left, a `notFound()` from a root
 *   layout itself, which only an address with a dot in it can reach.
 *
 * None of the three is reachable from the others, and all three were Next's bare
 * `<html id="__next_error">` until they existed. So the page lives here once and
 * each file is a few lines: one design, whichever road the reader took.
 */

/**
 * The reader's language, read twice because the two roads carry it differently,
 * and Spanish only when the address really does not name one.
 *
 * `next/root-params` and not `params`, because a `not-found.tsx` gets none: that
 * is exactly what root params are for -- `[locale]` sits above the root layout, so
 * its value is readable from any Server Component without prop drilling. It is
 * typed `string | undefined` because there are two root layouts and only one of
 * them has the segment.
 *
 * **And a header under it, because `/en/vzcxz` says `en` in plain sight and has no
 * root params at all.** An address the route tree never matched has no segment for
 * `locale()` to read, so every 404 under a prefixed language was answered in
 * Spanish -- the archive telling an English reader, in Spanish, that their address
 * is wrong. next-intl's middleware has already resolved the language by then and
 * passes it on as `x-next-intl-locale`, so this is the same decision `[locale]` is
 * made of rather than a second one. It arrives from a request, so it is read
 * through `isLocale` like every other value that does: the worst a forged header
 * can do is print this page in one of the other three.
 *
 * `/admin` and the addresses with a dot in them are outside the proxy's matcher
 * and carry no header, which is why the fallback stays: the panel is Spanish, and
 * `/foo.php` names no language to answer in.
 */
export async function notFoundLocale(): Promise<Locale> {
  const asked = await localeParam()
  if (isLocale(asked)) return asked

  const said = (await headers()).get('x-next-intl-locale')
  return isLocale(said) ? said : defaultLocale
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
