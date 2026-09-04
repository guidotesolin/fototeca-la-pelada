/**
 * Smoke test for search: the query in `src/db/queries/search.ts` run against the
 * real archive, plus the pure functions that read a URL into it.
 *
 * It exists for the two acceptance criteria T8 was written around -- "Tesolin"
 * finds "Tesolín" and "educacion" finds "Educación" -- because both depend on
 * things that are easy to break from a distance: the `es_unaccent` configuration
 * T2 created, and the fact that the searchable document is not only the caption.
 * Sixty-one of the sixty-two Tesolín photographs are found through their credit
 * and every Educación one through its section name, so a `DOCUMENT` that quietly
 * loses either still returns results and still looks like it works.
 *
 * It calls `runSearch` rather than the cached `search`: `unstable_cache` needs a
 * Next request context and there is none in a CLI.
 *
 * **The `--conditions=react-server` in the npm script is load-bearing.** This is
 * the one tool that reaches the query modules, and those import `@/db`, which
 * imports the `server-only` marker package -- whose default export throws on
 * import, by design, so that a client component reaching the database fails the
 * build (F8, closed in T9). The marker resolves to an empty module under the
 * `react-server` export condition, which is what the App Router sets and what a
 * plain `tsx` process does not, so the flag is how a CLI says it is the server.
 * Without it this script dies before its first check. The alternative was
 * threading a client through `search.ts` for the benefit of one test, which is
 * more code in the query path than the flag is anywhere.
 *
 *   npm run search:smoke
 */
import assert from 'node:assert/strict'
import type { SearchQuery } from '../src/db/queries/search'

try {
  process.loadEnvFile('.env.local')
} catch {
  // Fine: the variable may come from the environment instead.
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set: copy .env.example to .env.local and fill it in.')
  process.exit(1)
}

async function main() {
  // Imported here and not at the top: the module builds the database client as it
  // loads, and an `import` runs before the environment file above is read.
  const {
    NO_FILTERS,
    facetsFrom,
    parseFilters,
    parsePage,
    parseText,
    runFacetRows,
    runSearch,
    searchHref,
  } = await import('../src/db/queries/search')

  let checks = 0

  function check(name: string, condition: boolean, detail: string) {
    assert.ok(condition, `${name}: ${detail}`)
    checks++
  }

  const query = (q: string, rest: Partial<SearchQuery> = {}): SearchQuery => ({
    q,
    section: null,
    credit: null,
    decade: null,
    ...rest,
  })

  const total = async (q: string, rest: Partial<SearchQuery> = {}) =>
    (await runSearch('es', query(q, rest), 1)).total

  // --- the acceptance criteria, both directions of the accent -------------------

  const tesolin = await total('Tesolin')
  const tesolinAccented = await total('Tesolín')
  check('unaccent', tesolin > 1, `"Tesolin" found ${tesolin}: the credit is not in the document`)
  check(
    'unaccent',
    tesolin === tesolinAccented,
    `"Tesolin" found ${tesolin} and "Tesolín" found ${tesolinAccented}`,
  )

  const educacion = await total('educacion')
  const educacionAccented = await total('Educación')
  check(
    'unaccent',
    educacion > 0,
    '"educacion" found nothing: the section name is not in the document',
  )
  check(
    'unaccent',
    educacion === educacionAccented,
    `"educacion" found ${educacion} and "Educación" found ${educacionAccented}`,
  )

  // The section name is the only place the word exists, so this is the same set.
  const inSection = await total('', { section: 'educacion' })
  check(
    'section name',
    educacion === inSection,
    `"educacion" found ${educacion}, the Educación section holds ${inSection}`,
  )

  // --- stemming, and the sensitive photographs being in here at all -------------

  check('stemming', (await total('escuelas')) === (await total('escuela')), 'plural and singular')

  const carneada = await runSearch('es', query('carneada'), 1)
  check('sensitive', carneada.total > 0, '"carneada" found none of the carneadas')
  check(
    'sensitive',
    carneada.photos.some((p) => p.sensitive),
    'no result is flagged sensitive, so nothing would be blurred',
  )

  // --- filters ------------------------------------------------------------------

  const everything = facetsFrom(await runFacetRows('es', ''), NO_FILTERS, 'es')
  check(
    'facets',
    everything.credits.length > 0 && everything.decades.length > 0,
    'a filter has no options',
  )

  const sixties = await total('', { decade: 1960 })
  check('decade', sixties > 0, 'the 1960s filter found nothing')
  // Inclusive on both ends and an overlap, so a photograph dated 1959-1961 counts.
  check('decade', (await total('', { decade: 999_0 })) === 0, 'an empty decade returned rows')

  const credit = everything.credits[0].value
  const byCredit = await runSearch('es', query('', { credit }), 1)
  check('credit', byCredit.total > 0, `no photograph credited to ${credit}`)
  check(
    'credit',
    byCredit.photos.every((p) => p.credit === credit),
    'a result carries a different credit',
  )

  const narrowed = await total('Tesolin', { section: 'espacios' })
  check('combined', narrowed > 0 && narrowed < tesolin, `${tesolin} narrowed to ${narrowed}`)

  // --- the four languages -------------------------------------------------------

  /**
   * **A word that lives only in the epigraphs, and that is the point of it.**
   *
   * The first version of this loop searched "Tesolin" in all four languages and
   * passed while the fallback was broken, because "Tesolin" is a **credit**: it
   * appears in 62 credits and in exactly **one** caption, and the credit half of
   * `DOCUMENT` is re-tokenized at query time in the asked locale, so it matches
   * in any language whatever the captions do. The check was green with the
   * caption path returning nothing. Measured: "escuela" reached 25 photographs in
   * Spanish and 0 in English.
   *
   * So the assertion moved onto a caption-only word. **It was "escuela", and T15
   * had to change it**, which is worth recording because the check did not break
   * -- its premise did. With no translations loaded, every locale fell back to the
   * Spanish text, so a Spanish word had to reach the same 25 photographs in all
   * four languages. Now that the archive is translated, `/en` searches an English
   * caption that says "school", and "escuela" reaches 2. That is the design
   * working, not failing.
   *
   * The word is now **"Independiente"**, and it holds the same assertion for a
   * better reason: it is a protected term, so `docs/TRANSLATION.md` guarantees it
   * survives translation verbatim, and 35 photographs carry it in every language.
   * The check therefore proves two things at once -- that each locale's own text
   * is being searched, and that the glossary did its job.
   */
  const CAPTION_ONLY = 'Independiente'
  const inCaptions = await total(CAPTION_ONLY)
  check(
    'the word is a caption word',
    inCaptions > 0,
    `"${CAPTION_ONLY}" is not in any epigraph, so this loop would prove nothing`,
  )
  const viaCredit = await total(CAPTION_ONLY, { credit: 'no-such-credit-exists' })
  check(
    'the word is not a credit word',
    viaCredit === 0,
    `"${CAPTION_ONLY}" is reachable through a credit, so it cannot test the caption path`,
  )

  for (const locale of ['es', 'en', 'fr', 'it'] as const) {
    const found = (await runSearch(locale, query(CAPTION_ONLY), 1)).total
    check(
      'every language reaches the epigraphs',
      found === inCaptions,
      `${locale} found ${found} of the ${inCaptions} photographs whose caption says "${CAPTION_ONLY}" -- the text is not being stemmed in the reader's own configuration`,
    )
  }

  /**
   * And the other half, which only became testable once the archive was
   * translated: **each language searches its own text and not the Spanish.**
   *
   * A word that exists only in the Spanish caption has to reach *fewer*
   * photographs in the other three, because their captions say something else.
   * If the per-locale text selection ever regressed to always coalescing to
   * Spanish, this is what would catch it -- the loop above would not, since a
   * protected term reads the same either way.
   */
  const SPANISH_ONLY = 'escuela'
  const inSpanish = await total(SPANISH_ONLY)
  check(
    'the Spanish word is in the Spanish epigraphs',
    inSpanish > 1,
    `"${SPANISH_ONLY}" reaches ${inSpanish} photographs in Spanish, which is too few to prove anything`,
  )
  for (const locale of ['en', 'fr', 'it'] as const) {
    const found = (await runSearch(locale, query(SPANISH_ONLY), 1)).total
    check(
      'the other languages read their own epigraphs',
      found < inSpanish,
      `${locale} found ${found} for the Spanish word "${SPANISH_ONLY}", the same ${inSpanish} Spanish reaches -- it is searching the Spanish text rather than its own`,
    )
  }

  /**
   * And the credit half, which is the other acceptance criterion: 61 of the 62
   * Tesolín photographs carry the surname only in `credit`, so a `DOCUMENT` that
   * quietly lost it would still look like it worked.
   */
  for (const locale of ['es', 'en', 'fr', 'it'] as const) {
    const found = (await runSearch(locale, query('Tesolin'), 1)).total
    check(
      'every language reaches the credits',
      found === tesolin,
      `${locale} found ${found} of the ${tesolin} Tesolín photographs`,
    )
    const rows = await runFacetRows(locale, 'Tesolin')
    check('every language filters', rows.length === tesolin, `${locale} facets over ${rows.length}`)
  }

  // --- pagination ---------------------------------------------------------------

  const first = await runSearch('es', query('Tesolin'), 1)
  const second = await runSearch('es', query('Tesolin'), 2)
  check('paging', first.total === second.total, 'the total moved between pages')
  check('paging', second.photos.length > 0, 'page two is empty on a 62-result search')
  check(
    'paging',
    first.photos.every((p) => !second.photos.some((q) => q.slug === p.slug)),
    'a photograph appears on both pages',
  )

  // --- whatever someone types ---------------------------------------------------

  for (const hostile of ['"', "'", 'a & b', 'or', '-', '<script>', '\\', 'a'.repeat(200), '   ']) {
    const rows = await runSearch('es', query(hostile), 1)
    check('hostile input', rows.total >= 0, `${JSON.stringify(hostile)} did not come back`)
  }

  // --- the filters offer only what the words reach ------------------------------

  const tesolinRows = await runFacetRows('es', 'Tesolin')
  const open = facetsFrom(tesolinRows, NO_FILTERS, 'es')
  const decades = open.decades.map((d) => d.value)
  check(
    'facets follow the search',
    !decades.includes(1870),
    `"Tesolin" still offers the 1870s: ${decades.join(', ')}`,
  )
  check(
    'facets follow the search',
    decades.length > 0 && decades.length < everything.decades.length,
    `"Tesolin" offers ${decades.length} decades of the archive's ${everything.decades.length}`,
  )

  /**
   * The number on the option is the number of results, for every option of every
   * filter. This is the strong form of "no dead ends": an option that found
   * nothing would have to say so, and one that lied about the count would fail
   * here rather than in front of a reader.
   */
  for (const { value, count } of open.decades) {
    const got = await total('Tesolin', { decade: value })
    check('the count is the result', count === got, `the ${value}s say ${count} and return ${got}`)
    check('no dead ends', got > 0, `the ${value}s are offered for "Tesolin" and find nothing`)
  }
  for (const { value, count } of open.sections) {
    const got = await total('Tesolin', { section: value })
    check('the count is the result', count === got, `${value} says ${count} and returns ${got}`)
    check('no dead ends', got > 0, `${value} is offered for "Tesolin" and finds nothing`)
  }
  for (const { value, count } of open.credits) {
    const got = await total('Tesolin', { credit: value })
    check('the count is the result', count === got, `${value} says ${count} and returns ${got}`)
  }

  // And it stays exact once another filter narrows it, which is the case an
  // estimate would get wrong: the count is taken with that filter applied.
  const withDecade = facetsFrom(tesolinRows, { ...NO_FILTERS, decade: decades[0] }, 'es')
  for (const { value, count } of withDecade.sections) {
    const got = await total('Tesolin', { section: value, decade: decades[0] })
    check(
      'the count is the result',
      count === got,
      `${value} in the ${decades[0]}s says ${count} and returns ${got}`,
    )
  }

  // A filter is computed without its own value, so choosing one never empties the
  // menu it was chosen from -- otherwise a reader could not change their mind.
  const narrowedTo = facetsFrom(
    tesolinRows,
    { ...NO_FILTERS, section: open.sections[0].value },
    'es',
  )
  check(
    'facets exclude their own filter',
    narrowedTo.sections.length === open.sections.length,
    'picking a section pruned the section list',
  )
  check(
    'facets exclude their own filter',
    narrowedTo.decades.length <= open.decades.length,
    'picking a section did not narrow the decades',
  )

  // And a combination that finds nothing still shows what was chosen, at zero.
  const impossible = facetsFrom(
    [],
    { ...NO_FILTERS, decade: 1870, credit: 'Familia Tesolín' },
    'es',
  )
  assert.deepEqual(impossible.decades, [{ value: 1870, count: 0 }])
  assert.deepEqual(impossible.credits, [{ value: 'Familia Tesolín', count: 0 }])
  checks += 2

  // A photograph spanning 1879-1914 belongs to every decade in between, which is
  // the same overlap rule the SQL filter applies.
  const spanning = facetsFrom(
    [{ credit: null, yearFrom: 1879, yearTo: 1914, sections: [] }],
    NO_FILTERS,
    'es',
  )
  assert.deepEqual(
    spanning.decades.map((d) => d.value),
    [1870, 1880, 1890, 1900, 1910],
  )
  checks++
  assert.deepEqual(
    facetsFrom([{ credit: null, yearFrom: null, yearTo: null, sections: [] }], NO_FILTERS, 'es')
      .decades,
    [],
  )
  checks++

  // --- the URL, which is the other half of "every search has an address" --------

  const n = (value: string | number) => ({ value, count: 1 })
  const AVAILABLE = {
    sections: [n('campo'), n('educacion')] as { value: string; count: number }[],
    credits: [n('Familia Tesolín')] as { value: string; count: number }[],
    decades: [n(1960)] as { value: number; count: number }[],
  }

  assert.equal(parseText({ q: '  Tesolín  ' }), 'Tesolín')
  checks++
  assert.equal(parseText({ q: ['uno', 'dos'] }), 'uno')
  checks++
  assert.equal(parseText({}), '')
  checks++
  assert.equal(parseText({ q: 'x'.repeat(500) }).length, 100)
  checks++

  const parsed = {
    q: parseText({ q: 'Tesolín' }),
    ...parseFilters({ seccion: 'campo', credito: 'Familia Tesolín', decada: '1960' }, AVAILABLE),
  }
  assert.deepEqual(parsed, {
    q: 'Tesolín',
    section: 'campo',
    credit: 'Familia Tesolín',
    decade: 1960,
  })
  checks++

  // A value the words do not reach is dropped, not answered with an empty page.
  assert.deepEqual(
    parseFilters({ seccion: 'no-such-section', credito: 'Nobody', decada: '9999' }, AVAILABLE),
    NO_FILTERS,
  )
  checks++

  assert.equal(
    searchHref('es', parsed),
    '/buscar?q=Tesol%C3%ADn&seccion=campo&credito=Familia+Tesol%C3%ADn&decada=1960',
  )
  checks++
  assert.equal(searchHref('es', query('')), '/buscar')
  checks++
  assert.equal(searchHref('es', query('a'), 3), '/buscar?q=a&p=3')
  checks++
  // Page one is the bare address, so one result set has one URL and not two.
  assert.equal(searchHref('es', query('a'), 1), '/buscar?q=a')
  checks++

  // Spanish has no prefix and the other three do, which is `as-needed`. The
  // parameter names stay Spanish in all four: they are part of a shared address.
  assert.equal(searchHref('en', query('a'), 2), '/en/buscar?q=a&p=2')
  checks++
  assert.equal(searchHref('fr', query('')), '/fr/buscar')
  checks++

  for (const [input, expected] of [
    [undefined, 1],
    ['1', 1],
    ['3', 3],
    ['0', 1],
    ['-4', 1],
    ['2.7', 2],
    ['abc', 1],
    ['1e400', 1],
    ['99999999', 10_000],
  ] as const) {
    assert.equal(parsePage(input), expected, `parsePage(${JSON.stringify(input)})`)
    checks++
  }

  console.log(`\n${checks} checks pass`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  // The app's database client is never closed: it is built for a long-lived
  // server, not for a CLI, so this script leaves rather than waiting on it.
  .finally(() => process.exit(process.exitCode ?? 0))
