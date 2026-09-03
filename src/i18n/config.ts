import type { Metadata } from 'next'

/**
 * Which languages the public site has, and how one of them reaches a URL.
 *
 * The codes are here and not in the database, for the same reason the header's
 * picker already carried them before this task: which languages exist is a
 * matter of what has been built, not of what has been translated. The `locale`
 * enum in the schema holds the same four, and Spanish is the source language and
 * the fallback in both places.
 *
 * **Nothing in this file imports `next-intl`**, so a client component can read
 * it: `localeHref` is what every link on the public site goes through, and one of
 * those links lives inside the deck, which is Swiper and therefore client-side.
 */

export const locales = ['es', 'en', 'fr', 'it'] as const

export type Locale = (typeof locales)[number]

/** Spanish is the source, so it is what a missing translation falls back to. */
// `as const` and not a bare literal: the value reaches Drizzle as
// `SOURCE_LOCALE`, and a widening `'es'` becomes `string` inside an object
// literal -- which the `locale` enum column then refuses.
export const defaultLocale = 'es' as const satisfies Locale

/** The picker's labels, in the panel's order. Names of languages, never translated. */
export const LOCALE_LABELS: Record<Locale, string> = {
  es: 'ESP',
  en: 'ENG',
  fr: 'FRA',
  it: 'ITA',
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value)
}

/**
 * A public address in a given language.
 *
 * **Spanish carries no prefix** -- `as-needed`, in next-intl's terms -- so
 * `/foto/espacios-001` goes on being _the_ Spanish URL and
 * `/en/foto/espacios-001` is added beside it. Three reasons, and the first is
 * the archive's own: the whole point of this site over Google Sites is a
 * per-photo permalink that can be shared, and the link that will actually
 * travel through the town's WhatsApp is the short one. Second, no reader pays a
 * redirect hop on a normal visit. Third, `always` would change every URL the
 * archive has ever published, which is the one thing a permalink may not do.
 *
 * The path segments stay Spanish in all four languages -- `/en/foto`, not
 * `/en/photo` -- which is _Language conventions_ in ARCHITECTURE: the public
 * routes are user-facing content with SEO weight, and they were built in
 * Spanish.
 */
export function localeHref(locale: Locale, path: string): string {
  if (locale === defaultLocale) return path
  return path === '/' ? `/${locale}` : `/${locale}${path}`
}

/**
 * The locale a public path is prefixed with, and the path without it.
 *
 * Used where a request is read rather than written: the proxy needs the
 * photograph's slug out of both `/foto/x` and `/en/foto/x`, and the language
 * switch needs the page the reader was on regardless of which language it was
 * in. An unprefixed path is Spanish, which is the whole of `as-needed`.
 */
export function splitLocale(pathname: string): { locale: Locale; path: string } {
  const [, first, ...rest] = pathname.split('/')
  if (isLocale(first)) return { locale: first, path: `/${rest.join('/')}` }
  return { locale: defaultLocale, path: pathname }
}

/**
 * Where the language picker sends a reader: the page they were on, in the
 * language they asked for.
 *
 * A pure function and not part of the proxy, because it is the security boundary
 * of this feature and it should be testable without a request. `npm run
 * i18n:smoke` covers it.
 *
 * **The `Referer` is attacker-controllable input, so the answer is checked rather
 * than the input trusted.** A referer that passes the same-origin test can still
 * carry a pathname beginning with `//` -- `http://site//evil.com`, which is what
 * a browser makes of `/\/evil.com` too -- and `new URL('//evil.com', origin)`
 * resolves that as a **new origin**: the switch would redirect off the site.
 * Measured before it was closed, and it fired only on the Spanish button, where
 * `localeHref` returns the path untouched. That asymmetry is exactly the kind
 * that survives a reading.
 *
 * So the built URL is asserted against the origin rather than the path being
 * pattern-matched: `//`, `/\`, userinfo and anything else `URL` chooses to
 * interpret all fail the same check, and the answer to any of them is the same
 * as the answer to no `Referer` at all -- that language's home page.
 */
export function switchHref(locale: Locale, referer: string | null, origin: string): string {
  const home = new URL(localeHref(locale, '/'), origin).href
  if (!referer) return home

  let from: URL
  try {
    from = new URL(referer)
  } catch {
    // Not a URL. The home page in the chosen language is still the right answer.
    return home
  }
  if (from.origin !== origin) return home

  const to = new URL(localeHref(locale, splitLocale(from.pathname).path) + from.search, origin)
  return to.origin === origin ? to.href : home
}

/**
 * `hreflang` for the four languages plus `x-default`, and the canonical for the
 * one being rendered. Per page and never on a layout: `alternates` is inherited
 * by every route below it, so a canonical declared once at the top would tell a
 * search engine that all 592 photographs are the home page.
 *
 * `x-default` is Spanish, which is what an unprefixed URL serves.
 */
export function alternatesFor(locale: Locale, path: string): Metadata['alternates'] {
  return {
    canonical: localeHref(locale, path),
    languages: {
      ...Object.fromEntries(locales.map((l) => [l, localeHref(l, path)])),
      'x-default': localeHref(defaultLocale, path),
    },
  }
}
