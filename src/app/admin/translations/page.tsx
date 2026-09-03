import type { Metadata } from 'next'
import { translationProgress } from '@/db/queries/admin'
import { requireAdmin } from '@/lib/auth'
import { SOURCE_LOCALE } from '@/db/queries/gallery'
import { LOCALE_LABELS, isLocale, localeHref } from '@/i18n/config'
import { Back } from '../ui'

/**
 * What is still untranslated, per language.
 *
 * Read-only on purpose: T15 is the translation work itself, and what it needs
 * first is to know where the work is. A screen that reported "0 of 592" and
 * nothing else would send somebody looking through eleven sections by hand.
 *
 * In Spanish, like the whole panel. Only the two of them use it, so there is no
 * `next-intl` here -- the strings are written below, which is exactly what
 * _Language conventions_ asks for. It is the one screen where that separation is
 * worth stating out loud, because it is the screen about translation.
 *
 * Spanish is its own row and reads 100% by construction: it is the source
 * language, so what exists in Spanish is the definition of what there is to
 * translate. That is where every denominator on this page comes from.
 */
export const metadata: Metadata = { title: 'Traducciones' }

/** The names the brothers use, not the codes. The panel is theirs to read. */
const LANGUAGE: Record<string, string> = {
  es: 'Español',
  en: 'Inglés',
  fr: 'Francés',
  it: 'Italiano',
}

const ROWS = [
  ['captions', 'Epígrafes'],
  ['notes', 'Notas de fuente'],
  ['names', 'Nombres de sección'],
  ['intros', 'Introducciones de sección'],
  ['texts', 'Textos del sitio'],
] as const

export default async function AdminTranslations() {
  await requireAdmin()
  const { progress, bySection } = await translationProgress()

  const totals = progress.find((row) => row.locale === SOURCE_LOCALE)
  const others = progress.filter((row) => row.locale !== SOURCE_LOCALE)

  return (
    <>
      <Back />

      <h1 className="t-section mt-4">Traducciones</h1>

      <p className="t-intro text-muted mt-6 max-w-[62ch]">
        El español es el idioma fuente: todo lo que está escrito en español es lo que hay para
        traducir, y lo que falta en otro idioma se muestra en español en el sitio público. Nada de
        esto se rompe si una traducción no está.
      </p>

      {/* One table, four columns of counts. The whole point is comparing the
          languages, so they are columns and not four separate cards. */}
      <div className="mt-10 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left">
          <thead>
            <tr className="border-rule border-b">
              <th className="t-label py-3 pr-4">Qué</th>
              <th className="t-label py-3 pr-4">En español</th>
              {others.map((row) => (
                <th key={row.locale} className="t-label py-3 pr-4">
                  {LANGUAGE[row.locale] ?? row.locale}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([field, label]) => {
              const total = totals?.[field] ?? 0
              return (
                <tr key={field} className="border-rule border-b">
                  <th scope="row" className="t-credit py-3 pr-4 font-normal">
                    {label}
                  </th>
                  <td className="t-meta py-3 pr-4">{total}</td>
                  {others.map((row) => (
                    <td key={row.locale} className="t-meta py-3 pr-4">
                      {row[field]} / {total}
                      {total > 0 && (
                        <span className="text-muted">
                          {' '}
                          · {Math.round((row[field] / total) * 100)}%
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Twelve keys and eleven sections are few enough to name; 592 captions are
          not, so those are broken down by section below instead. */}
      {others.map((row) => {
        const sections = bySection.filter((s) => s.locale === row.locale)
        return (
          <section key={row.locale} className="mt-12">
            <h2 className="t-signature border-rule border-b pb-2">
              {LANGUAGE[row.locale] ?? row.locale}
              {isLocale(row.locale) && (
                <>
                  {' '}
                  {/* An anchor and not a `Link`, like every other panel link to the
                      public site: a client navigation can serve a five-minute-old
                      copy from the client cache, and this link exists to check what
                      the language actually looks like. */}
                  <a
                    href={localeHref(row.locale, '/')}
                    className="t-credit link text-muted hover:text-text focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    ver el sitio en {LOCALE_LABELS[row.locale]} →
                  </a>
                </>
              )}
            </h2>

            <dl className="mt-4 flex flex-col gap-4">
              <div>
                <dt className="t-label">Textos del sitio sin traducir</dt>
                <dd className="t-meta mt-1">
                  {row.missingTexts.length === 0 ? 'Ninguno.' : row.missingTexts.join(', ')}
                </dd>
              </div>
              <div>
                <dt className="t-label">Secciones sin nombre traducido</dt>
                <dd className="t-meta mt-1">
                  {row.missingNames.length === 0 ? 'Ninguna.' : row.missingNames.join(', ')}
                </dd>
              </div>
              <div>
                <dt className="t-label">Epígrafes que faltan, por sección</dt>
                <dd className="t-meta mt-1">
                  {sections.length === 0
                    ? 'Ninguno: está todo traducido.'
                    : sections.map((s) => `${s.slug} ${s.missing}`).join(' · ')}
                </dd>
              </div>
            </dl>
          </section>
        )
      })}
    </>
  )
}
