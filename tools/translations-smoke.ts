/**
 * The two pieces of the translation editor that are logic rather than markup,
 * and would both fail quietly.
 *
 * **`parseTarget` is a trust boundary.** It turns a string a browser sent into
 * the table, row and language a write lands on, so every shape it must refuse is
 * asserted here rather than reasoned about at the form -- Spanish above all,
 * which is the source language and is edited on the three screens that own it.
 *
 * **`missingTerms` is the check nobody would notice going wrong.** It fires next
 * to a box while a machine translation is being reviewed, and a check that
 * silently matches nothing looks exactly like a clean translation. The archive's
 * own captions are the fixtures, including the one this whole glossary exists
 * for: "María Luisa" is a locality here, and it has been read as a person once
 * already.
 *
 *   npm run translations:smoke
 *
 * No database and no Next request context: everything under test is pure.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  DEFAULT_FILTER,
  ITEM_KINDS,
  labelFor,
  limitFor,
  parseItem,
  parseTarget,
  QUEUE_FILTERS,
  readTranslations,
  TARGET_LOCALES,
  targetId,
  translatorHref,
} from '../src/app/admin/translations/items'
import { TRANSLATABLE_SITE_TEXT } from '../src/app/admin/site-text/fields'
import { defaultLocale, locales } from '../src/i18n/config'
import { missingTerms, PROTECTED_TERMS } from '../src/lib/glossary'

let checks = 0

// --- the identity of a piece, round trip ---------------------------------

for (const locale of TARGET_LOCALES) {
  for (const [kind, id] of [
    ['caption', 'espacios-001'],
    ['notes', 'campo-002'],
    ['name', 'inundacion-78'],
    ['intro', 'campo'],
    ['text', 'home_intro'],
  ] as const) {
    const parsed = parseTarget(targetId(locale, { kind, id }))
    assert.deepEqual(parsed, { locale, item: { kind, id } }, `${locale}:${kind}:${id}`)
    checks += 1
  }
}

/** Everything a form may send that must never become a write. */
const HOSTILE = [
  // Spanish is the source language. This is the one that would overwrite the
  // archive rather than add to it, and it is the reason the check exists.
  'es:caption:espacios-001',
  ...locales.map((l) => `${l}:caption:espacios-001`).filter((s) => s.startsWith(defaultLocale)),
  // Not a language at all.
  'de:caption:espacios-001',
  'EN:caption:espacios-001',
  ':caption:espacios-001',
  // Not a kind.
  'en:credit:espacios-001',
  'en:slug:espacios-001',
  'en:caption',
  'en',
  '',
  // A `site_text` key that is not language: an email address and three social
  // URLs are the same value in four languages, and `TRANSLATABLE_SITE_TEXT` is
  // what says so. A French copy of a Gmail address is not a translation.
  'en:text:contact',
  'en:text:facebook_url',
  'en:text:map_embed_url',
  'en:text:__proto__',
  // Slugs that are not slugs. The section shape is the tighter of the two.
  'en:caption:../../etc/passwd',
  'en:caption:Espacios-001',
  'en:caption:espacios 001',
  'en:name:UPPER',
  'en:name:-leading',
  `en:caption:${'a'.repeat(65)}`,
]
for (const raw of HOSTILE) {
  assert.equal(parseTarget(raw), null, `parseTarget should refuse ${JSON.stringify(raw)}`)
  checks += 1
}
for (const raw of [null, undefined, 42, {}, ['en:caption:espacios-001']]) {
  assert.equal(parseTarget(raw), null, `parseTarget should refuse ${String(raw)}`)
  assert.equal(parseItem(raw), null)
  checks += 2
}

// A colon inside a `site_text` key would split in the wrong place; none has one,
// and this is what keeps that true if somebody adds a key.
for (const key of TRANSLATABLE_SITE_TEXT) {
  assert.ok(!key.includes(':'), `${key} would break the field name's own separator`)
  assert.deepEqual(parseItem(`text:${key}`), { kind: 'text', id: key })
  checks += 2
}

// Every kind is reachable from the queue's filters, and every filter names a
// real kind: a kind with no filter is work nobody can open.
assert.deepEqual(
  [...new Set(Object.values(QUEUE_FILTERS).map((f) => f.kind))].sort(),
  [...ITEM_KINDS].sort(),
)
assert.ok(DEFAULT_FILTER in QUEUE_FILTERS)
checks += 2

// Limits: the four fixed ones, and `site_text`'s, which follows the field's kind.
assert.equal(limitFor({ kind: 'caption', id: 'espacios-001' }), 4000)
assert.equal(limitFor({ kind: 'name', id: 'campo' }), 120)
assert.equal(limitFor({ kind: 'text', id: 'home_title' }), 300, 'a line is 300')
assert.equal(limitFor({ kind: 'text', id: 'home_intro' }), 4000, 'a paragraph is 4000')
assert.equal(labelFor({ kind: 'text', id: 'home_intro' }), 'Presentación')
checks += 5

// The translator link carries the text in the fragment, which a browser does not
// send to a server. A caption in a query string would be one in a request log.
const href = translatorHref('en', 'Calle 20 de agosto & Belgrano')
assert.ok(href.startsWith('https://www.deepl.com/translator#es/en/'), href)
assert.ok(!href.includes('?'), 'the source text must not reach a query string')
assert.ok(href.includes(encodeURIComponent('&')), 'the source text must be encoded')
checks += 3

// --- the write path's own boundary ----------------------------------------

// A repeated target reaches Postgres as an `on conflict do update` that affects
// one row twice, which is an error rather than an answer. It is refused instead.
{
  const form = new FormData()
  for (const value of ['first', 'second']) {
    form.append('item', 'en:text:home_title')
    form.append('value', value)
  }
  assert.throws(() => readTranslations(form), { message: 'interno' }, 'a repeated target')
  checks += 1
}

// The two arrays have to be the same length. A textarea always posts, even empty,
// so they cannot drift on their own -- but nothing says the request came from us.
{
  const form = new FormData()
  form.append('item', 'en:text:home_title')
  assert.throws(() => readTranslations(form), { message: 'interno' }, 'unbalanced arrays')
  checks += 1
}

// Over the limit is refused, and the limit is the field's own.
{
  const form = new FormData()
  form.append('item', 'en:text:home_title')
  form.append('value', 'x'.repeat(301))
  assert.throws(() => readTranslations(form), { message: 'largo' }, 'a line over 300')
  checks += 1
}

// Whitespace only is "not translated", not a value: it falls back to Spanish.
{
  const form = new FormData()
  form.append('item', 'en:caption:espacios-001')
  form.append('value', '  \r\n  ')
  assert.deepEqual(readTranslations(form), [
    { target: { locale: 'en', item: { kind: 'caption', id: 'espacios-001' } }, value: null },
  ])
  checks += 1
}

// CRLF becomes LF: every consumer of these values splits paragraphs on \n\n, and
// one section intro in the archive is stored with CRLF already.
{
  const form = new FormData()
  form.append('item', 'en:text:town_intro')
  form.append('value', 'One.\r\n\r\nTwo.')
  assert.equal(readTranslations(form)[0].value, 'One.\n\nTwo.')
  checks += 1
}

// --- the do-not-translate check ------------------------------------------

/** Real captions from the archive, with a translation that is right and one that is not. */
const CASES: [string, string, string[]][] = [
  // The one the glossary exists for. "María Luisa" is a locality in this archive.
  [
    'MEMORIAS DE LA PELADA - Maria Luisa Ravasio',
    'MEMORIES OF LA PELADA - Maria Luisa Ravasio',
    [],
  ],
  [
    'MEMORIAS DE LA PELADA - Maria Luisa Ravasio',
    'MEMORIES OF THE BALD ONE - Mary Louise Ravasio',
    ['La Pelada', 'María Luisa'],
  ],
  // Streets, and a local term in the same caption. The policy is Spanish plus a
  // short gloss, so the accepted translation is the one that keeps the term --
  // and this fixture was written the other way round first, which is the check
  // catching the exact mistake it is there for.
  [
    'Comercio de ramos generales, esquina Iturraspe y Belgrano.',
    'A ramos generales store (a rural general store), corner of Iturraspe and Belgrano.',
    [],
  ],
  [
    'Comercio de ramos generales, esquina Iturraspe y Belgrano.',
    'General store, corner of Iturraspe and Belgrano Street.',
    ['ramos generales'],
  ],
  [
    'Bretes del ex ferrocarril Belgrano. Actual pasaje 20 de agosto.',
    'Cattle chutes of the former Belgrano railway. Now 20th of August lane.',
    ['20 de agosto'],
  ],
  // A local term: it stays in Spanish and carries a gloss.
  ['Tradicional carneada.', 'A traditional carneada (rural animal butchering).', []],
  ['Tradicional carneada.', 'A traditional pig slaughter.', ['carneada']],
  // Accents are folded, so a translator writing Tesolin for Tesolín is fine.
  ['Cortesía: Familia Tesolín', 'Courtesy of the Tesolin family', []],
  // Nothing translated yet is not a mistake.
  ['Tradicional carneada.', '', []],
  ['Tradicional carneada.', '   ', []],
  // Nothing protected in the source, nothing to report.
  ['Trabajos de siembra.', 'Sowing work.', []],
]
for (const [source, translation, expected] of CASES) {
  assert.deepEqual(
    missingTerms(source, translation).sort(),
    [...expected].sort(),
    `${source} → ${translation}`,
  )
  checks += 1
}

// A term that is in the source and copied verbatim is never reported: this is
// what stops the warning from crying wolf on every well-behaved translation.
for (const term of PROTECTED_TERMS) {
  assert.deepEqual(missingTerms(`... ${term} ...`, `... ${term} ...`), [])
  assert.deepEqual(missingTerms(`... ${term} ...`, 'nothing of the sort'), [term])
  checks += 2
}

// --- the proposal files ---------------------------------------------------

// They are committed empty and stay valid: the panel reads them on every render
// of an editing screen, and a malformed one would take three screens down.
for (const locale of TARGET_LOCALES) {
  const path = new URL(`../src/app/admin/translations/proposals/${locale}.json`, import.meta.url)
  const file = JSON.parse(readFileSync(path, 'utf8')) as {
    locale: string
    items: { source: string; proposed: string }[]
  }
  assert.equal(file.locale, locale)
  assert.ok(Array.isArray(file.items))
  for (const item of file.items) {
    assert.equal(typeof item.source, 'string')
    assert.equal(typeof item.proposed, 'string')
    assert.ok(item.source.trim(), `${locale}: a proposal with no source text`)
  }
  checks += 2 + file.items.length * 3
}

console.log(
  `\n${checks} checks pass over ${TARGET_LOCALES.length} target languages, ` +
    `${ITEM_KINDS.length} kinds of piece and ${PROTECTED_TERMS.length} protected terms`,
)
