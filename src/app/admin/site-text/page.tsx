import type { Metadata } from 'next'
import { listSiteTextForEdit, siteTextTranslations } from '@/db/queries/admin'
import { requireAdmin } from '@/lib/auth'
import { externalUrl } from '@/lib/url'
import { Back, BUTTON, FIELD, Field, Notice } from '../ui'
import { LIMITS, SITE_TEXT, type SiteTextField, TRANSLATABLE_SITE_TEXT } from './fields'
import { saveSiteText } from './actions'
import { LANGUAGE, TARGET_LOCALES } from '../translations/items'
import { proposalsFor } from '../translations/proposals'
import { TranslationRow } from '../translations/row'

/**
 * Every word the site says about itself, in one form. This is the screen the
 * whole design points at: _whatever is content lives in the database and is
 * edited from the panel; only behaviour and layout live in code._ The rights
 * notice, the agradecimiento and the paragraphs about the town look like prose
 * and are really rows.
 *
 * A `link` is offered with an "Abrir" beside it, and only once `externalUrl` has
 * passed it: a row that predates this screen is no more trusted than one typed
 * into it.
 */
export const metadata: Metadata = { title: 'Editar textos' }

export default async function AdminSiteText(props: PageProps<'/admin/site-text'>) {
  await requireAdmin()
  const params = await props.searchParams
  const text = await listSiteTextForEdit()
  const stored = await siteTextTranslations()

  const groups = [...new Set(SITE_TEXT.map((field) => field.where))]
  // The seven that are language. An email address and three social URLs are the
  // same value in four languages, which is `TRANSLATABLE_SITE_TEXT`'s whole job.
  const translatable = SITE_TEXT.filter((field) => TRANSLATABLE_SITE_TEXT.includes(field.key))

  return (
    <>
      <Back />

      <h1 className="t-section mt-4">Textos del sitio</h1>

      <Notice params={params} />

      <p className="t-intro text-muted mt-6">
        Todo lo que el sitio dice de sí mismo se escribe acá y se ve en el sitio apenas se guarda:
        no hace falta tocar el código ni esperar a nadie. Un campo vacío desaparece de la página.
      </p>

      <form action={saveSiteText} className="mt-12">
        {groups.map((group) => (
          <section key={group} className="mt-12 first:mt-0">
            <h2 className="t-label border-rule border-b pb-2">{group}</h2>
            <div className="mt-5 grid max-w-2xl gap-5">
              {SITE_TEXT.filter((field) => field.where === group).map((field) => (
                <Control key={field.key} field={field} value={text[field.key] ?? ''} />
              ))}
            </div>
          </section>
        ))}

        {/* Inside this form and saved by the same button, like the photo and
            section screens: one Guardar, one transaction, nothing left unsent. */}
        <section className="mt-14">
          <h2 className="t-label border-rule border-b pb-2">Traducciones</h2>
          <p className="t-meta text-muted mt-3 max-w-[62ch]">
            Lo que dejes vacío se sigue mostrando en español en ese idioma. El correo y las redes no
            aparecen acá: son la misma dirección en los cuatro idiomas.
          </p>

          {TARGET_LOCALES.map((locale) => {
            const proposals = proposalsFor(locale)
            const has = translatable.some((field) => stored[locale]?.[field.key])
            return (
              <details key={locale} open={has} className="border-rule mt-4 border-b pb-4">
                <summary className="t-credit cursor-pointer py-1">
                  {LANGUAGE[locale] ?? locale}
                  {!has && <span className="text-muted"> · sin traducir</span>}
                </summary>
                <div className="mt-2 grid max-w-2xl gap-5">
                  {translatable.map((field) => (
                    <TranslationRow
                      key={field.key}
                      locale={locale}
                      item={{ kind: 'text', id: field.key }}
                      source={text[field.key] ?? ''}
                      current={stored[locale]?.[field.key] ?? ''}
                      proposed={proposals.get(text[field.key] ?? '')}
                      label={field.label}
                    />
                  ))}
                </div>
              </details>
            )
          })}
        </section>

        <button type="submit" className={`${BUTTON} mt-10`}>
          Guardar textos
        </button>
      </form>
    </>
  )
}

function Control({ field, value }: { field: SiteTextField; value: string }) {
  if (field.kind === 'text') {
    return (
      <Field label={field.label} hint={field.hint}>
        <textarea
          name={field.key}
          rows={5}
          maxLength={LIMITS[field.kind]}
          defaultValue={value}
          className={FIELD}
        />
      </Field>
    )
  }

  const type = field.kind === 'email' ? 'email' : field.kind === 'line' ? 'text' : 'url'
  // A link is shown as a link, and only if it still passes the guard: a row that
  // predates this screen is no more trusted than one typed into it.
  const href = field.kind === 'link' ? externalUrl(value) : null

  return (
    <Field
      label={field.label}
      hint={
        href ? (
          <>
            {field.hint}{' '}
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="link text-accent hover:text-text underline underline-offset-2"
            >
              Abrir
            </a>
          </>
        ) : (
          field.hint
        )
      }
    >
      <input type={type} name={field.key} defaultValue={value} maxLength={2000} className={FIELD} />
    </Field>
  )
}
