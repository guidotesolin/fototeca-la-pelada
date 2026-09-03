/**
 * Smoke test for the message files: the four of them agree, and every message in
 * every one of them formats.
 *
 * It exists because the failures it catches are all invisible until a reader hits
 * them, and only in one language:
 *
 * - A key added to `es.json` and forgotten in `it.json` renders the key itself,
 *   `header.settings`, on the Italian page.
 * - `{count, plural, one {# foto} other {# fotos}}` mistyped in one language is a
 *   runtime formatting error on exactly the pages that use it.
 * - A placeholder renamed on one side -- `{q}` becoming `{query}` -- formats to a
 *   literal `{q}` and never throws.
 *
 * It uses `use-intl`'s own translator, which is what `next-intl` runs at request
 * time, so what passes here is what the pages will do. `onError` throws instead of
 * warning, because a warning in a CLI is a test that always passes.
 *
 * It also checks the routing arithmetic, which is the other half of this module
 * and the part everything else depends on: every link on the public site goes
 * through `localeHref`, the proxy reads a request with `splitLocale`, and the
 * language picker is the two of them composed. They have to be inverses.
 *
 *   npm run i18n:smoke
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createTranslator } from 'use-intl/core'
import {
  alternatesFor,
  defaultLocale,
  localeHref,
  locales,
  splitLocale,
  switchHref,
} from '../src/i18n/config'

type Tree = { [key: string]: string | Tree }

const load = (locale: string): Tree =>
  JSON.parse(readFileSync(new URL(`../src/i18n/messages/${locale}.json`, import.meta.url), 'utf8'))

/** Every leaf, as the dotted path a `t()` call would name it. */
function leaves(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') out.set(path, value)
    else for (const [k, v] of leaves(value, path)) out.set(k, v)
  }
  return out
}

/**
 * The arguments a message asks for. A name followed by `plural`, `number` or
 * `selectordinal` has to be a number -- ICU raises on a string there, which is
 * precisely the mistake worth catching.
 */
function argsFor(message: string): Record<string, string | number> {
  const args: Record<string, string | number> = {}
  for (const [, name] of message.matchAll(/\{\s*([A-Za-z][A-Za-z0-9_]*)/g)) {
    const typed = new RegExp(`\\{\\s*${name}\\s*,\\s*(plural|number|selectordinal)`).test(message)
    args[name] = typed ? 1 : 'x'
  }
  return args
}

let checks = 0

const reference = leaves(load('es'))
assert.ok(reference.size > 0, 'es.json holds no messages')

for (const locale of locales) {
  const messages = load(locale)
  const own = leaves(messages)

  // Both directions: a key only in Spanish renders as its own path, and a key
  // only in one translation is dead weight nobody will ever delete.
  assert.deepEqual(
    [...own.keys()].sort(),
    [...reference.keys()].sort(),
    `${locale}.json does not carry the same keys as es.json`,
  )
  checks++

  /**
   * Cast, and the reason is the type rather than the code: `createTranslator` is
   * generic over a `Messages` declaration the app does not create, so its key
   * parameter narrows to `never`. This test walks keys it read at runtime, which
   * is exactly what that type is designed to forbid.
   */
  const t = createTranslator({
    locale,
    messages,
    onError: (error) => {
      throw error
    },
  }) as unknown as (key: string, args?: Record<string, string | number>) => string

  // The arguments come from the **Spanish** message, not from this one: that is
  // what catches a translation which renamed a placeholder, because the rename is
  // then left in the output as literal braces.
  for (const key of own.keys()) {
    const formatted = t(key, argsFor(reference.get(key)!))
    assert.equal(typeof formatted, 'string', `${locale}: ${key} did not format to a string`)
    // A placeholder the translation renamed survives formatting as literal braces.
    assert.ok(
      !/[{}]/.test(String(formatted)),
      `${locale}: ${key} left braces in ${JSON.stringify(formatted)} -- a placeholder was renamed`,
    )
    // A key with no message resolves to its own path, which is not a translation.
    assert.notEqual(String(formatted), key, `${locale}: ${key} formatted to its own key`)
    assert.ok(String(formatted).trim().length > 0, `${locale}: ${key} is empty`)
    checks++
  }
}

// --- the routing arithmetic ----------------------------------------------------

/**
 * `as-needed`: Spanish carries no prefix, the other three do. Written out rather
 * than derived, because the whole point is that these exact strings are the URLs
 * the archive has published and may not change.
 */
for (const [locale, path, href] of [
  ['es', '/', '/'],
  ['es', '/foto/espacios-001', '/foto/espacios-001'],
  ['en', '/', '/en'],
  ['en', '/foto/espacios-001', '/en/foto/espacios-001'],
  ['fr', '/categoria/campo/2', '/fr/categoria/campo/2'],
  ['it', '/buscar', '/it/buscar'],
] as const) {
  assert.equal(localeHref(locale, path), href, `localeHref(${locale}, ${path})`)
  checks++
}

/** The proxy's side of it, and the language picker's: reading a path back apart. */
for (const [pathname, locale, path] of [
  ['/', 'es', '/'],
  ['/foto/espacios-001', 'es', '/foto/espacios-001'],
  ['/en', 'en', '/'],
  ['/en/foto/espacios-001', 'en', '/foto/espacios-001'],
  ['/it/categoria/campo/2', 'it', '/categoria/campo/2'],
  // Not a language, so it is a Spanish path that happens to start with two
  // letters -- which is what stops `/es` from being invented out of `/eu/...`.
  ['/eu/foto/x', 'es', '/eu/foto/x'],
] as const) {
  assert.deepEqual(splitLocale(pathname), { locale, path }, `splitLocale(${pathname})`)
  checks++
}

/**
 * The round trip, which is what the picker actually performs: take the page the
 * reader is on, strip its language, put another one on. Every one of the four has
 * to come back to the same path.
 */
for (const from of locales) {
  for (const to of locales) {
    for (const path of ['/', '/foto/espacios-001', '/categoria/campo/2', '/buscar']) {
      const { path: stripped } = splitLocale(localeHref(from, path))
      assert.equal(stripped, path, `${from} → ${to} lost the path ${path}`)
      assert.equal(localeHref(to, stripped), localeHref(to, path))
      checks++
    }
  }
}

/**
 * The language picker's redirect, which is this feature's security boundary: it
 * turns a `Referer` -- attacker-controllable input -- into a `Location`.
 *
 * The second block is a **regression test for a real open redirect**, found while
 * reviewing this change. A same-origin referer can carry a pathname beginning
 * with `//`, and `new URL('//evil.example', origin)` resolves that as a new
 * origin, so `/idioma/es` answered `Location: http://evil.example/`. It fired on
 * the Spanish button only, because that is the branch where `localeHref` returns
 * the path untouched.
 */
const ORIGIN = 'https://fototecalapelada.com.ar'

for (const [locale, referer, href] of [
  // The ordinary case: the reader keeps the page they were on.
  ['en', `${ORIGIN}/foto/espacios-001`, `${ORIGIN}/en/foto/espacios-001`],
  ['es', `${ORIGIN}/en/foto/espacios-001`, `${ORIGIN}/foto/espacios-001`],
  ['it', `${ORIGIN}/categoria/campo/2`, `${ORIGIN}/it/categoria/campo/2`],
  // The query string travels: a filtered result set is an address someone sent.
  ['fr', `${ORIGIN}/buscar?q=tanque&seccion=campo`, `${ORIGIN}/fr/buscar?q=tanque&seccion=campo`],
  ['en', `${ORIGIN}/it`, `${ORIGIN}/en`],
  // No referer, an unparsable one, and another origin all land on the home page.
  ['en', null, `${ORIGIN}/en`],
  ['en', 'not a url', `${ORIGIN}/en`],
  ['en', 'https://evil.example/x', `${ORIGIN}/en`],
  ['es', 'https://evil.example/x', `${ORIGIN}/`],
] as const) {
  assert.equal(switchHref(locale, referer, ORIGIN), href, `switchHref(${locale}, ${referer})`)
  checks++
}

for (const hostile of [
  `${ORIGIN}//evil.example`,
  `${ORIGIN}//evil.example/x`,
  `${ORIGIN}/\\/evil.example`,
  `${ORIGIN}///evil.example`,
  `${ORIGIN}//user@evil.example`,
  `${ORIGIN}//evil.example?q=1`,
]) {
  for (const locale of locales) {
    const got = switchHref(locale, hostile, ORIGIN)
    assert.equal(
      new URL(got).origin,
      ORIGIN,
      `switchHref(${locale}, ${hostile}) left the site: ${got}`,
    )
    checks++
  }
}

/** hreflang: four languages, reciprocal, plus `x-default` on the unprefixed one. */
const alternates = alternatesFor('en', '/foto/espacios-001')
assert.equal(alternates?.canonical, '/en/foto/espacios-001')
assert.deepEqual(alternates?.languages, {
  es: '/foto/espacios-001',
  en: '/en/foto/espacios-001',
  fr: '/fr/foto/espacios-001',
  it: '/it/foto/espacios-001',
  'x-default': '/foto/espacios-001',
})
checks += 2

// Every language declares the same set, and each one's canonical is its own entry.
for (const locale of locales) {
  const a = alternatesFor(locale, '/buscar')
  assert.deepEqual(Object.keys(a?.languages ?? {}), [...locales, 'x-default'])
  assert.equal(
    a?.canonical,
    (a?.languages as Record<string, string>)[locale],
    `${locale}: the canonical is not its own alternate`,
  )
  assert.equal(
    (a?.languages as Record<string, string>)['x-default'],
    localeHref(defaultLocale, '/buscar'),
  )
  checks += 3
}

console.log(`\n${checks} checks pass over ${locales.length} languages × ${reference.size} messages`)
