import Link from 'next/link'
import { locale as localeParam } from 'next/root-params'
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { defaultLocale, isLocale, localeHref } from '@/i18n/config'

/**
 * The 404, and it exists because deleting `app/layout.tsx` moved the boundary.
 *
 * Next inserts a default not-found boundary at the **root layer** and at a first
 * layer that is a route *group*. `(public)` was a group, so before T13 the
 * archive had one inside its own header and footer, and the root layer had one
 * inside `<html lang="es">`. `[locale]` is a real segment rather than a group and
 * the root layout is gone, so the only remaining default boundary sat *above* the
 * public site's only `<html>`: every `notFound()` -- a mistyped permalink, a
 * gallery page past the end, a stale link off Facebook -- answered with Next's
 * bare fallback. Measured on the production build: `<html id="__next_error">`,
 * no `lang`, no stylesheet, no dark ground. Caught in review, not by a test.
 *
 * A file here puts the boundary back inside the public root layout, so a 404
 * renders as part of the archive again and in the reader's own language.
 *
 * **`next/root-params` and not `params`, because a `not-found.tsx` gets none.**
 * That is exactly what root params are for: `[locale]` sits above the root
 * layout, so its value is readable from any Server Component without prop
 * drilling. It is typed `string | undefined` because `/admin` is a second root
 * layout with no locale segment, and an unmatched URL has no locale at all --
 * both of which fall back to Spanish, which is the source language.
 */
export async function generateMetadata(): Promise<Metadata> {
  const asked = await localeParam()
  const t = await getTranslations({
    locale: isLocale(asked) ? asked : defaultLocale,
    namespace: 'notFound',
  })
  // Never indexed: it is not a page of the archive, it is the absence of one.
  return { title: t('title'), robots: { index: false, follow: true } }
}

export default async function NotFound() {
  const asked = await localeParam()
  const locale = isLocale(asked) ? asked : defaultLocale
  const t = await getTranslations({ locale, namespace: 'notFound' })

  return (
    <section className="mx-auto max-w-[46ch] py-10 text-center sm:py-16">
      <h1 className="t-section">{t('title')}</h1>
      <p className="t-intro text-muted mx-auto mt-6">{t('body')}</p>
      <Link
        href={localeHref(locale, '/')}
        className="t-credit link hover:text-focus focus-visible:outline-focus mt-8 inline-block underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {t('back')}
      </Link>
    </section>
  )
}
