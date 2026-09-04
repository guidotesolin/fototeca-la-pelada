import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { categoryTranslations, getCategoryForEdit } from '@/db/queries/admin'
import { requireAdmin } from '@/lib/auth'
import { publicUrl } from '@/lib/photo'
import { Back, BUTTON, FIELD, Field, Notice, Row } from '../../ui'
import { deleteCategory, saveCategory } from '../actions'
import { TARGET_LOCALES } from '../../translations/items'
import { proposalsFor } from '../../translations/proposals'
import { TranslationsFor } from '../../translations/row'

/**
 * One section: its name, the text that introduces it, and the photograph that
 * represents it on the portada.
 *
 * **The address is not editable, and that is a decision rather than an
 * omission.** `/categoria/<slug>` is what somebody shares in a WhatsApp group,
 * and the archive's permalinks are stable by design -- a photograph keeps its
 * slug even when it changes section, and a section's is the same promise one
 * level up. The name above it can be rewritten as often as they like.
 *
 * Every form here posts to a server action that calls `requireAdmin()` of its
 * own. Reaching this markup proves nothing about the next request.
 */
/** The slug names the tab rather than the section's name: same reason as on the
 * photo screen -- `getCategoryForEdit` is not request-cached, and the address is
 * already in hand. */
export async function generateMetadata(
  props: PageProps<'/admin/categories/[slug]'>,
): Promise<Metadata> {
  const { slug } = await props.params
  return { title: `Editar sección · ${slug}` }
}

export default async function EditCategory(props: PageProps<'/admin/categories/[slug]'>) {
  await requireAdmin()
  const { slug } = await props.params
  const section = await getCategoryForEdit(slug)
  if (!section) notFound()

  const params = await props.searchParams
  const stored = await categoryTranslations(slug)
  const proposals = Object.fromEntries(TARGET_LOCALES.map((l) => [l, proposalsFor(l)]))

  return (
    <>
      <Back href="/admin/categories" label="Home" />

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h1 className="t-section">{section.name}</h1>
        {section.visible ? (
          // A plain anchor, like the photo screen's: a client navigation can serve
          // a five-minute-old copy, and this link exists to check the change.
          <a
            href={`/categoria/${section.slug}`}
            className="t-credit link hover:text-text focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Ver en el sitio
          </a>
        ) : (
          <span className="t-label border-accent text-accent border px-2 py-1">oculta</span>
        )}
      </div>

      <Notice params={params} />

      <form action={saveCategory} className="mt-10">
        <input type="hidden" name="slug" value={section.slug} />

        <h2 className="t-label border-rule border-b pb-2">Contenido</h2>

        <div className="mt-5 grid gap-5">
          <Field label="Nombre" hint="Como se lee en la portada y en el menú.">
            <input
              type="text"
              name="name"
              required
              maxLength={120}
              defaultValue={section.name}
              className={FIELD}
            />
          </Field>

          <Field
            label="Introducción"
            hint="El texto que abre la sección, arriba de las fotografías. Dejá un renglón en blanco entre párrafo y párrafo."
          >
            <textarea name="intro" rows={5} defaultValue={section.intro ?? ''} className={FIELD} />
          </Field>
        </div>

        <h2 className="t-label border-rule mt-12 border-b pb-2">Portada de la sección</h2>
        <p className="t-meta mt-4">
          La fotografía que representa a la sección en la portada del sitio. Sólo se pueden elegir
          las de esta sección que estén publicadas.
        </p>

        {/* Says so when the section has a cover that is not among the options,
            which is what an unpublished cover looks like from here. The action
            leaves the column alone when nothing is checked, so the choice
            survives the takedown; this is so it does not survive invisibly. */}
        {section.coverPhotoId !== null &&
          !section.candidates.some((c) => c.id === section.coverPhotoId) && (
            <p role="status" className="bg-surface border-rule t-credit mt-5 border p-4">
              Su portada es una fotografía que ahora no está publicada, así que la portada del sitio
              muestra esta sección sin foto. Se conserva: si volvés a publicarla, vuelve. Para
              cambiarla, elegí otra acá abajo o «Ninguna».
            </p>
          )}

        {/* Radios over thumbnails, not a dropdown: choosing which photograph
            represents a section by reading its caption in a list is choosing
            blind. No JavaScript — the label is the picture.

            "Ninguna" is rendered even when there is nothing else to choose, so
            the group is never empty: a form with no radio at all submits no
            field, and there would be no way to clear a cover from this screen. */}
        <ul className="mt-5 flex flex-wrap gap-3">
          <li>
            <label className="block cursor-pointer">
              <input
                type="radio"
                name="coverPhotoId"
                value=""
                defaultChecked={section.coverPhotoId === null}
                className="peer sr-only"
              />
              <span className="border-rule peer-checked:border-accent peer-checked:text-accent text-muted peer-focus-visible:outline-focus flex h-22 w-22 items-center justify-center border text-center font-sans text-[11px] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2">
                Ninguna
              </span>
            </label>
          </li>
          {section.candidates.map((candidate) => (
            <li key={candidate.slug}>
              <label className="block cursor-pointer" title={candidate.caption ?? candidate.slug}>
                <input
                  type="radio"
                  name="coverPhotoId"
                  value={String(candidate.id)}
                  defaultChecked={section.coverPhotoId === candidate.id}
                  className="peer sr-only"
                />
                {/* eslint-disable-next-line @next/next/no-img-element -- the panel
                    does not need the picture element the public site is built on. */}
                <img
                  src={publicUrl(candidate.thumbKey)}
                  alt={candidate.caption ?? candidate.slug}
                  width={88}
                  height={88}
                  loading="lazy"
                  decoding="async"
                  className="peer-checked:outline-accent peer-focus-visible:outline-focus h-22 w-22 object-cover opacity-60 outline-offset-2 peer-checked:opacity-100 peer-checked:outline-2 peer-focus-visible:outline-2"
                />
              </label>
            </li>
          ))}
        </ul>

        {section.candidates.length === 0 && (
          <p className="t-meta mt-4">
            Esta sección todavía no tiene fotografías publicadas para elegir.
          </p>
        )}

        {/* Inside this form: one Guardar saves the Spanish and the three
            languages in one transaction. See `TranslationsFor`. */}
        <TranslationsFor
          id={section.slug}
          kinds={['name', 'intro']}
          source={{ name: section.name, intro: section.intro ?? '' }}
          stored={stored}
          proposals={proposals}
        />

        <button type="submit" className={`${BUTTON} mt-8`}>
          Guardar cambios
        </button>
      </form>

      <section className="mt-14">
        <h2 className="t-label border-rule border-b pb-2">Archivo</h2>
        <dl className="border-rule mt-1 border-t">
          <Row label="Dirección">
            /categoria/{section.slug} — no se cambia: es el enlace que la gente comparte.
          </Row>
          <Row label="En la portada">
            {section.visible ? `sí, en el lugar ${section.position}` : 'no, está oculta'}
          </Row>
          <Row label="Fotografías publicadas">{section.candidates.length}</Row>
        </dl>
      </section>

      <section className="mt-14">
        <h2 className="t-label border-rule border-b pb-2">Borrar</h2>
        <p className="t-intro text-muted mt-4">
          Una sección con fotografías no se puede borrar: una fotografía que se queda sin ninguna
          sección deja de aparecer en las galerías aunque siga publicada. Para sacarla del sitio sin
          perder nada, ocultala desde la portada.
        </p>
        <form action={deleteCategory} className="mt-5">
          <input type="hidden" name="slug" value={section.slug} />
          <button type="submit" className={BUTTON}>
            Borrar sección
          </button>
        </form>
      </section>
    </>
  )
}
