import { missingTerms } from '@/lib/glossary'
import type { Locale } from '@/i18n/config'
import { FIELD } from '../ui'
import {
  FIELDS,
  type Item,
  type ItemKind,
  LANGUAGE,
  labelFor,
  limitFor,
  TARGET_LOCALES,
  targetId,
  translatorHref,
} from './items'

/**
 * One piece of the archive, in one language: the Spanish above, a box below, and
 * whatever help can be given without getting in the way.
 *
 * The **same component in all four places** that edit a translation -- the queue,
 * a photograph, a section and the site's own words -- because they are the same
 * gesture and drawing it four times is how three of them end up subtly different.
 *
 * The box is pre-filled from the stored translation when there is one, and from
 * the machine's proposal when there is not. That difference is the whole reason
 * the editor is shaped this way: a proposed sentence to correct is a different
 * screen from an empty field, so it says which one it is rather than leaving the
 * reviewer to guess whether those words are theirs.
 */
export function TranslationRow({
  locale,
  item,
  source,
  current,
  proposed,
  /** The queue names the piece; the three Spanish screens name the language. */
  label,
}: {
  locale: Locale
  item: Item
  source: string
  current: string
  proposed?: string
  label?: string
}) {
  const value = current || proposed || ''
  const fromProposal = !current && Boolean(proposed)
  // On what is in the box, which is the moment it can still be fixed: warning
  // about a saved translation only after it is live is a worse time to find out.
  const missing = missingTerms(source, value)

  return (
    <div className="border-rule border-t pt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="t-label">{label ?? `${labelFor(item)} · ${item.id}`}</span>
        {source && (
          <a
            href={translatorHref(locale, source)}
            target="_blank"
            rel="noopener noreferrer"
            className="t-credit link text-muted hover:text-text focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            traducir a {LANGUAGE[locale] ?? locale} →
          </a>
        )}
      </div>

      {/* The source, to read and to copy. Selectable text and not a disabled
          input: a disabled control is awkward to select from on a phone, and the
          panel has to work on one. */}
      <p className="t-meta text-muted mt-2 whitespace-pre-wrap">{source || '—'}</p>

      <label className="mt-2 block">
        <span className="sr-only">
          {labelFor(item)} en {LANGUAGE[locale] ?? locale}
        </span>
        <textarea
          name="value"
          rows={FIELDS[item.kind].rows}
          maxLength={limitFor(item)}
          defaultValue={value}
          className={FIELD}
        />
      </label>
      <input type="hidden" name="item" value={targetId(locale, item)} />

      {fromProposal && (
        <p className="t-meta text-muted mt-1">
          Propuesta automática, sin revisar. No está en el sitio hasta que la guardes.
        </p>
      )}
      {missing.length > 0 && (
        <p role="alert" className="t-meta border-accent mt-1 border-l-2 pl-2">
          No aparece en la traducción: {missing.join(', ')}. Los nombres propios, las calles y los
          lugares no se traducen.
        </p>
      )}
    </div>
  )
}

/**
 * The three languages of one photograph or one section, folded into the screen
 * that already edits its Spanish.
 *
 * **Inside that screen's own form and saved by its own button**, which is the
 * point rather than a detail. The gesture this is built for is: import a
 * photograph, write the caption, copy it into a translator, paste three
 * translations back, press Guardar once. Two forms would have meant pressing the
 * lower button and silently losing the Spanish sitting unsent in the upper one.
 *
 * Collapsed unless the language already has something, so somebody who came here
 * to fix an accent in the Spanish sees the screen they came for.
 */
export function TranslationsFor({
  id,
  kinds,
  source,
  stored,
  proposals,
}: {
  id: string
  kinds: readonly ItemKind[]
  /** The Spanish, per field: what is translated and what is copied. */
  source: Record<string, string>
  /** What is saved, per language and field. */
  stored: Record<string, Record<string, string>>
  proposals: Record<string, Map<string, string>>
}) {
  return (
    <section className="mt-12">
      <h2 className="t-label border-rule border-b pb-2">Traducciones</h2>
      <p className="t-meta text-muted mt-3 max-w-[62ch]">
        Lo que dejes vacío se sigue mostrando en español en ese idioma, así que se puede traducir de
        a poco.
      </p>

      {TARGET_LOCALES.map((locale) => {
        const has = kinds.some((kind) => stored[locale]?.[kind])
        return (
          <details key={locale} open={has} className="border-rule mt-4 border-b pb-4">
            <summary className="t-credit cursor-pointer py-1">
              {LANGUAGE[locale] ?? locale}
              {!has && <span className="text-muted"> · sin traducir</span>}
            </summary>
            <div className="mt-2 grid gap-5">
              {kinds.map((kind) => (
                <TranslationRow
                  key={kind}
                  locale={locale}
                  item={{ kind, id }}
                  source={source[kind] ?? ''}
                  current={stored[locale]?.[kind] ?? ''}
                  proposed={proposals[locale]?.get(source[kind] ?? '')}
                  label={FIELDS[kind].label}
                />
              ))}
            </div>
          </details>
        )
      })}
    </section>
  )
}
