import { getRequestConfig } from 'next-intl/server'
import { defaultLocale, isLocale } from './config'

/**
 * The messages for one render. `next-intl/plugin` aliases `next-intl/config` to
 * this file, so it is the only place message files are read.
 *
 * **Every caller passes its locale explicitly** -- `getTranslations({locale})`,
 * with the locale taken from the route's own `params` -- and that is not a style
 * choice. Left to resolve the locale itself, next-intl reads it from a request
 * header, and reading a header opts the component into dynamic rendering: the
 * whole pre-rendered archive would render per request, which is the one thing
 * _Cross-cutting decision: the public site is pre-rendered_ exists to prevent.
 * With an explicit locale nothing touches `headers()`, so the pages stay static
 * and `setRequestLocale` -- next-intl's own deprecated escape hatch for exactly
 * this -- is not needed.
 *
 * `requestLocale` is still read, for the one caller that cannot pass anything:
 * `/admin`, which renders outside `[locale]` and is Spanish anyway.
 */
export default getRequestConfig(async ({ locale, requestLocale }) => {
  const asked = locale ?? (await requestLocale)
  const resolved = isLocale(asked) ? asked : defaultLocale

  return {
    locale: resolved,
    messages: (await import(`./messages/${resolved}.json`)).default,
  }
})
