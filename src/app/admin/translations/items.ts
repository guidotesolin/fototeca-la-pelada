import { defaultLocale, isLocale, locales, type Locale } from '@/i18n/config'
import { Invalid } from '../invalid'
import { isSectionSlug } from '@/lib/slug'
import { LIMITS, SITE_TEXT, TRANSLATABLE_SITE_TEXT } from '../site-text/fields'

/**
 * What one translatable piece of the archive is, and how a form names it.
 *
 * There are 559 of them per language -- 519 captions, 12 source notes, 11 section
 * names, 10 section intros and the 7 `site_text` keys that are language -- spread
 * over three tables. A form that edits a page of them needs one string per row
 * that says which, and **that string arrives from a browser**, so everything here
 * is written as a parser rather than as a formatter: `parseItem` is the only way
 * in, it returns `null` for anything it does not recognise, and the caller turns
 * that into `Invalid`.
 *
 * The kind alone names the table, so the id needs no second prefix:
 * `caption:espacios-001`, `name:campo`, `text:home_title`.
 */

export const ITEM_KINDS = ['caption', 'notes', 'name', 'intro', 'text'] as const

export type ItemKind = (typeof ITEM_KINDS)[number]

export type Item = { kind: ItemKind; id: string }

/**
 * The shape `photo.slug` has. Looser than `isSectionSlug` on purpose: these were
 * minted by the seed and are not ours to tighten retroactively -- the same
 * comment `admin/photos/actions.ts` carries over the same regex.
 */
const PHOTO_SLUG = /^[a-z0-9-]{1,64}$/

/**
 * What each kind is called on screen, how tall its box is, and which table and
 * column it lands in. One table so that a new translatable field is one row here
 * rather than a change in four files.
 */
export const FIELDS: Record<
  ItemKind,
  { label: string; rows: number; where: 'photo' | 'category' | 'site' }
> = {
  caption: { label: 'Epígrafe', rows: 4, where: 'photo' },
  notes: { label: 'Nota de fuente', rows: 3, where: 'photo' },
  name: { label: 'Nombre de la sección', rows: 2, where: 'category' },
  intro: { label: 'Introducción de la sección', rows: 5, where: 'category' },
  text: { label: 'Texto del sitio', rows: 4, where: 'site' },
}

/**
 * The `?que=` values, in Spanish because the panel is and because an
 * administrator reads the address bar -- the same reason `/admin/photos` says
 * `?filtro=` and `?seccion=`.
 */
export const QUEUE_FILTERS: Record<string, { kind: ItemKind; label: string }> = {
  epigrafes: { kind: 'caption', label: 'Epígrafes' },
  notas: { kind: 'notes', label: 'Notas de fuente' },
  nombres: { kind: 'name', label: 'Nombres de sección' },
  introducciones: { kind: 'intro', label: 'Introducciones de sección' },
  textos: { kind: 'text', label: 'Textos del sitio' },
}

export const DEFAULT_FILTER = 'epigrafes'

/** The `?que=` value for a kind, which is how the dashboard links into the queue. */
export function filterFor(kind: ItemKind): string {
  return (
    Object.keys(QUEUE_FILTERS).find((key) => QUEUE_FILTERS[key].kind === kind) ?? DEFAULT_FILTER
  )
}

export function itemId(item: Item): string {
  return `${item.kind}:${item.id}`
}

/**
 * The only way a form's string becomes an `Item`.
 *
 * Each kind validates its own id, and the third case is why this is not one
 * regex: a `site_text` key is checked against the seven keys that are actually
 * language, so `text:map_embed_url` and `text:contact` are refused here rather
 * than quietly writing a French copy of an email address.
 */
export function parseItem(raw: unknown): Item | null {
  if (typeof raw !== 'string') return null
  const at = raw.indexOf(':')
  if (at < 1) return null
  const kind = raw.slice(0, at)
  const id = raw.slice(at + 1)
  if (!(ITEM_KINDS as readonly string[]).includes(kind)) return null

  switch (kind as ItemKind) {
    case 'caption':
    case 'notes':
      return PHOTO_SLUG.test(id) ? { kind: kind as ItemKind, id } : null
    case 'name':
    case 'intro':
      return isSectionSlug(id) ? { kind: kind as ItemKind, id } : null
    case 'text':
      return TRANSLATABLE_SITE_TEXT.includes(id) ? { kind: 'text', id } : null
  }
}

/**
 * Longest accepted, per piece.
 *
 * The first four mirror the Spanish editors' own limits
 * (`admin/photos/actions.ts` and `admin/categories/actions.ts`) and are stated
 * again rather than imported: those constants also cover fields that are not
 * language -- a credit, a restoration method -- so merging them would drag two
 * working actions into this file's shape for four numbers.
 *
 * ponytail: two copies of four limits. If a third editor ever needs them, move
 * all of it into one table and have the Spanish actions read from it.
 *
 * A `site_text` key is the exception and is **not** a copy: its limit follows the
 * field's own `kind`, which is where that decision already lives.
 */
export function limitFor(item: Item): number {
  switch (item.kind) {
    case 'name':
      return 120
    case 'text': {
      const field = SITE_TEXT.find((f) => f.key === item.id)
      return field ? LIMITS[field.kind] : LIMITS.text
    }
    default:
      return 4000
  }
}

/** The label a `site_text` piece shows, which is the one the Spanish screen uses. */
export function labelFor(item: Item): string {
  if (item.kind !== 'text') return FIELDS[item.kind].label
  return SITE_TEXT.find((f) => f.key === item.id)?.label ?? item.id
}

/** A piece in a language: what one box on a form actually edits. */
export type Target = { locale: Locale; item: Item }

/**
 * The name a form field carries, which is the whole of what a box needs to say.
 *
 * The language is in the string rather than in a hidden field beside it, because
 * the photo screen edits three languages in one form: a single `idioma` field
 * would have to be right for every row, and a row that means something different
 * from what its neighbour means is the kind of thing that goes wrong once and is
 * never found.
 */
export function targetId(locale: Locale, item: Item): string {
  return `${locale}:${itemId(item)}`
}

/**
 * The only way a form's field name becomes a target.
 *
 * **Spanish is refused here.** It is the source language and it is edited on the
 * three screens that already own it, so a second door to it, reachable from a
 * form whose purpose is to add languages, is a way to overwrite the archive by
 * accident. `parseItem` refuses everything else the same way.
 */
export function parseTarget(raw: unknown): Target | null {
  if (typeof raw !== 'string') return null
  const at = raw.indexOf(':')
  if (at < 1) return null
  const locale = raw.slice(0, at)
  if (!isLocale(locale) || locale === defaultLocale) return null
  const item = parseItem(raw.slice(at + 1))
  return item ? { locale, item } : null
}

/** The three the editor writes: every language except the one it translates from. */
export const TARGET_LOCALES = locales.filter((l) => l !== defaultLocale)

/**
 * The names the brothers use, not the codes. In one place because three screens
 * and the queue all say them, and a panel that calls it "Inglés" here and "ENG"
 * there reads as assembled from parts.
 */
export const LANGUAGE: Record<string, string> = {
  es: 'Español',
  en: 'Inglés',
  fr: 'Francés',
  it: 'Italiano',
}

/**
 * The translator, opened on the text that needs translating.
 *
 * The reviewer was going to paste this into DeepL either way -- that is the
 * workflow this editor was designed around -- so the link saves the copying and
 * adds no exposure the gesture did not already have. **The text travels in the
 * fragment**, which a browser does not send to the server, so opening the link
 * does not put a caption in anybody's request log; DeepL's own page reads it and
 * translates it, which is the point of going.
 *
 * A plain `<a>`, so no JavaScript and no dependency, and `noreferrer` so the
 * panel's own address does not travel either. The longest caption in the archive
 * is 557 characters, which no browser has ever minded.
 */
export function translatorHref(locale: Locale, source: string): string {
  return `https://www.deepl.com/translator#${defaultLocale}/${locale}/${encodeURIComponent(source)}`
}

/** One box's worth of intent: this piece, in this language, becomes this. */
export type Entry = { target: Target; value: string | null }

/**
 * Every translation box on a form, validated.
 *
 * Separate from the write, and called **before** the transaction opens, because
 * that is the rule the panel already holds itself to: a rejected field must not
 * leave the other nine saved and the screen reporting a failure.
 *
 * The two arrays are parallel -- a hidden `item` and its `value` -- which is the
 * shape `saveHome` already uses to save the order of the sections. A textarea
 * always posts, even when empty, so the two lists cannot drift apart the way a
 * checkbox would make them.
 */
export function readTranslations(form: FormData): Entry[] {
  const names = form.getAll('item')
  const values = form.getAll('value')
  if (names.length !== values.length) throw new Invalid('interno')

  // A form drawn by this application never names the same box twice, and one
  // that does would reach Postgres as an `on conflict do update` affecting a row
  // a second time -- an error, and a 500 where a refusal belongs. Rejected here,
  // at the boundary, so all four callers get it.
  const seen = new Set<string>()

  return names.map((name, index) => {
    const target = parseTarget(name)
    if (!target) throw new Invalid('idioma')
    if (typeof name !== 'string' || seen.has(name)) throw new Invalid('interno')
    seen.add(name)
    const raw = values[index]
    if (typeof raw !== 'string') throw new Invalid('interno')
    // A textarea posts CRLF and every consumer of these values splits on \n\n --
    // the same normalisation the site-text screen does, and it matters more here:
    // one section intro in the archive already carries CRLF.
    const value = raw.replace(/\r\n/g, '\n').trim()
    if (value.length > limitFor(target.item)) throw new Invalid('largo')
    // Empty is not a hole. `coalesce(nullif(caption, ''), source.caption)` on the
    // public side means a cleared translation falls back to Spanish, which is how
    // somebody takes a bad translation off the site without losing the caption.
    return { target, value: value || null }
  })
}
