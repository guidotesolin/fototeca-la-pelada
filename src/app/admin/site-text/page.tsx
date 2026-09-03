import Link from 'next/link'
import type { Metadata } from 'next'
import { listSiteTextForEdit } from '@/db/queries/admin'
import { requireAdmin } from '@/lib/auth'
import { externalUrl, mapEmbedUrl } from '@/lib/url'
import { BUTTON, FIELD, Field, Notice } from '../ui'
import { LIMITS, SITE_TEXT, type SiteTextField } from './fields'
import { saveSiteText } from './actions'

/**
 * Every word the site says about itself, in one form. This is the screen the
 * whole design points at: _whatever is content lives in the database and is
 * edited from the panel; only behaviour and layout live in code._ The rights
 * notice, the agradecimiento and the paragraphs about the town look like prose
 * and are really rows.
 *
 * The map is previewed through `mapEmbedUrl` -- the same guard the action saves
 * through and the same one the home page renders through. A stored value predates
 * this screen, so the panel does not get to assume one is safe either.
 */
export const metadata: Metadata = { title: 'Editar textos' }

export default async function AdminSiteText(props: PageProps<'/admin/site-text'>) {
  await requireAdmin()
  const params = await props.searchParams
  const text = await listSiteTextForEdit()

  const groups = [...new Set(SITE_TEXT.map((field) => field.where))]
  const mapUrl = mapEmbedUrl(text.map_embed_url)

  return (
    <>
      <Link
        href="/admin/categories"
        className="t-credit link text-muted hover:text-text focus-visible:outline-focus inline-block py-1.5 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        ← Portada
      </Link>

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

        <button type="submit" className={`${BUTTON} mt-10`}>
          Guardar textos
        </button>
      </form>

      <section className="mt-14">
        <h2 className="t-label border-rule border-b pb-2">El mapa, como se ve</h2>
        {mapUrl ? (
          <div className="mount mt-5 max-w-lg">
            <div className="print relative" style={{ aspectRatio: '4 / 3' }}>
              <iframe
                src={mapUrl}
                title="Mapa de La Pelada"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="absolute inset-0 h-full w-full border-0"
              />
            </div>
          </div>
        ) : (
          <p className="t-meta mt-4">
            No hay ningún mapa cargado, así que la portada no lo muestra.
          </p>
        )}
      </section>
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
