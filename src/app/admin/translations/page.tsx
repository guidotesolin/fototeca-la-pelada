import type { Metadata } from 'next'
import { translationProgress } from '@/db/queries/admin'
import { requireAdmin } from '@/lib/auth'
import { SOURCE_LOCALE } from '@/db/queries/gallery'
import { LOCALE_LABELS, isLocale, localeHref } from '@/i18n/config'
import Link from 'next/link'
import { Back } from '../ui'
import { LANGUAGE } from './items'

/**
 * What is still untranslated, per language.
 *
 * **It measures and it links; it does not edit.** Every number on it is a way
 * into `/admin/translations/[locale]`, filtered to exactly the work it counts, so
 * the measurement is also the index of the job -- which is what a backlog of 559
 * pieces per language needs to be doable in sittings. Until T15 it counted and
 * stopped there, and a screen that reports "0 of 519" and nothing else sends
 * somebody looking through eleven sections by hand (F45).
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

/**
 * The five kinds of piece, and the `?que=` each one opens the queue on. The
 * counted thing and the link that goes and fixes it are the same row, so they
 * are written next to each other and cannot drift.
 */
const ROWS = [
  ['captions', 'Epígrafes', 'epigrafes'],
  ['notes', 'Notas de fuente', 'notas'],
  ['names', 'Nombres de sección', 'nombres'],
  ['intros', 'Introducciones de sección', 'introducciones'],
  ['texts', 'Textos del sitio', 'textos'],
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
            {ROWS.map(([field, label, que]) => {
              const total = totals?.[field] ?? 0
              return (
                <tr key={field} className="border-rule border-b">
                  <th scope="row" className="t-credit py-3 pr-4 font-normal">
                    {label}
                  </th>
                  <td className="t-meta py-3 pr-4">{total}</td>
                  {others.map((row) => (
                    <td key={row.locale} className="t-meta py-3 pr-4">
                      {/* The count is the link. A cell that says 0 / 519 is
                          exactly the cell somebody wants to click. */}
                      <Link
                        href={`/admin/translations/${row.locale}?que=${que}`}
                        className="link hover:text-text focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        {row[field]} / {total}
                      </Link>
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

            <p className="mt-3">
              <Link
                href={`/admin/translations/${row.locale}`}
                className="t-credit link hover:text-text focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Traducir al {(LANGUAGE[row.locale] ?? row.locale).toLowerCase()} →
              </Link>
            </p>

            <dl className="mt-4 flex flex-col gap-4">
              <div>
                <dt className="t-label">Textos del sitio sin traducir</dt>
                <dd className="t-meta mt-1">
                  {row.missingTexts.length === 0 ? (
                    'Ninguno.'
                  ) : (
                    <Link
                      href={`/admin/translations/${row.locale}?que=textos`}
                      className="link hover:text-text focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      {row.missingTexts.join(', ')}
                    </Link>
                  )}
                </dd>
              </div>
              <div>
                <dt className="t-label">Secciones sin nombre traducido</dt>
                <dd className="t-meta mt-1">
                  {row.missingNames.length === 0 ? (
                    'Ninguna.'
                  ) : (
                    <Link
                      href={`/admin/translations/${row.locale}?que=nombres`}
                      className="link hover:text-text focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      {row.missingNames.join(', ')}
                    </Link>
                  )}
                </dd>
              </div>
              <div>
                <dt className="t-label">Epígrafes que faltan, por sección</dt>
                {/* One link per section, because a section is the unit somebody
                    actually takes on: the queue opens on exactly these. */}
                <dd className="t-meta mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  {sections.length === 0
                    ? 'Ninguno: está todo traducido.'
                    : sections.map((s) => (
                        <Link
                          key={s.slug}
                          href={`/admin/translations/${row.locale}?que=epigrafes&seccion=${s.slug}`}
                          className="link hover:text-text focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                          {s.slug} {s.missing}
                        </Link>
                      ))}
                </dd>
              </div>
            </dl>
          </section>
        )
      })}
    </>
  )
}
