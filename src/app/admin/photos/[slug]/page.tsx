import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPhotoForEdit } from '@/db/queries/admin'
import { requireAdmin } from '@/lib/auth'
import { keyFor, publicUrl } from '@/lib/photo'
import { BUTTON, Check, FIELD, Field, Notice, Row, one } from '../../ui'
import { attachRestoration, removeRestoration, saveDetails, setPublished } from '../actions'
import { FilePicker } from '../file-picker'

/**
 * One photograph: everything about it that is content, and the two operations
 * that are not -- publishing, which is the takedown, and the restoration.
 *
 * Every form here posts to a server action that calls `requireAdmin()` of its own.
 * Reaching this markup proves nothing about the next request, which is why the
 * check is never left to the screen.
 */

/** The slug names the tab, straight from the address: it is what the heading
 * below shows anyway, and reading it from `params` keeps a title off the
 * database -- `getPhotoForEdit` is not request-cached, so a lookup here would
 * be a second round trip for every render of the screen. */
export async function generateMetadata(
  props: PageProps<'/admin/photos/[slug]'>,
): Promise<Metadata> {
  const { slug } = await props.params
  return { title: `Editar foto · ${slug}` }
}

export default async function EditPhoto(props: PageProps<'/admin/photos/[slug]'>) {
  await requireAdmin()
  const { slug } = await props.params
  const photo = await getPhotoForEdit(slug)
  if (!photo) notFound()

  const params = await props.searchParams

  /**
   * The web copy when there is one, the master when there is not -- which is what
   * an unpublished photograph looks like, since the takedown deleted every
   * derivative. Seeing what you are about to put back is the point.
   */
  const preview = photo.webKey
    ? publicUrl(keyFor(photo.webKey, photo.webWidth ?? 480, 'webp'))
    : photo.masterKey
      ? publicUrl(photo.masterKey)
      : null

  return (
    <>
      <Link
        href="/admin/photos"
        className="t-credit link text-muted hover:text-text focus-visible:outline-focus inline-block py-1.5 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        ← Fotografías
      </Link>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h1 className="t-section">{photo.slug}</h1>
        {photo.published ? (
          /**
           * A plain anchor, not `Link`, and this is the fix for the complaint that
           * an edit "took minutes to show". Next's client cache keeps a statically
           * generated page for **five minutes** by default, and a `Link` both
           * prefetches into it and navigates from it -- so the screen you reach
           * right after saving is the one from before the save. A document load
           * has no such cache, and this link exists precisely to check the change.
           */
          <a
            href={`/foto/${photo.slug}`}
            className="t-credit link hover:text-text focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Ver en el sitio
          </a>
        ) : (
          <span className="t-label border-accent text-accent border px-2 py-1">sin publicar</span>
        )}
      </div>

      <Notice params={params} />

      {preview && (
        <figure className="mt-8">
          {/* eslint-disable-next-line @next/next/no-img-element -- the panel does not
              need the picture element the public site is built around. */}
          <img
            src={preview}
            alt=""
            className="mount max-h-[26rem] w-auto max-w-full object-contain"
          />
          <figcaption className="t-meta mt-2">
            {photo.webKey ? 'Como se ve en el sitio' : 'Copia original — no está publicada'}
          </figcaption>
        </figure>
      )}

      <form action={saveDetails} className="mt-10">
        <input type="hidden" name="slug" value={photo.slug} />

        <h2 className="t-label border-rule border-b pb-2">Contenido</h2>

        <div className="mt-5 grid gap-5">
          <Field label="Epígrafe" hint="El texto que acompaña la fotografía en el sitio.">
            <textarea
              name="caption"
              rows={4}
              defaultValue={photo.caption ?? ''}
              className={FIELD}
            />
          </Field>

          <Field label="Cortesía" hint="La familia que prestó la fotografía.">
            <input type="text" name="credit" defaultValue={photo.credit ?? ''} className={FIELD} />
          </Field>

          <Field
            label="Nota"
            hint="De dónde viene el dato: el libro del Centenario, una entrevista."
          >
            <textarea name="notes" rows={3} defaultValue={photo.notes ?? ''} className={FIELD} />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Año desde">
              <input
                type="number"
                name="yearFrom"
                min={1800}
                max={new Date().getFullYear() + 1}
                defaultValue={photo.yearFrom ?? ''}
                className={FIELD}
              />
            </Field>
            <Field label="Año hasta" hint="Sólo si es un rango.">
              <input
                type="number"
                name="yearTo"
                min={1800}
                max={new Date().getFullYear() + 1}
                defaultValue={photo.yearTo ?? ''}
                className={FIELD}
              />
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Lugar">
              <input type="text" name="place" defaultValue={photo.place ?? ''} className={FIELD} />
            </Field>
            <Field label="Fuente">
              <input
                type="text"
                name="source"
                defaultValue={photo.source ?? ''}
                className={FIELD}
              />
            </Field>
          </div>

          <Check
            name="sensitive"
            defaultChecked={photo.sensitive}
            label="Contenido sensible"
            hint="Se muestra desenfocada con un aviso, nunca oculta."
          />
          <Check
            name="featured"
            defaultChecked={photo.featured}
            label="Destacada"
            hint="Aparece en la franja de destacadas de la portada, arriba de las secciones."
          />
        </div>

        <button type="submit" className={`${BUTTON} mt-7`}>
          Guardar cambios
        </button>
      </form>

      <section className="mt-14">
        <h2 className="t-label border-rule border-b pb-2">Publicación</h2>
        <p className="t-intro text-muted mt-4">
          {photo.published
            ? 'Está publicada. Al despublicarla sale del sitio: deja de aparecer en las secciones y en el buscador, y su página deja de estar disponible. No se borra nada: la imagen queda guardada tal como está, así que volver a publicarla es inmediato. Lo único que sigue funcionando es el enlace directo al archivo de imagen, para quien ya lo tenga anotado.'
            : 'No está publicada: no aparece en el sitio, ni en las secciones, ni en el buscador, y su página no está disponible. La imagen quedó guardada, así que al publicarla vuelve a estar en línea al instante.'}
        </p>
        <form action={setPublished} className="mt-5">
          <input type="hidden" name="slug" value={photo.slug} />
          <input type="hidden" name="published" value={photo.published ? 'false' : 'true'} />
          <button type="submit" className={BUTTON}>
            {photo.published ? 'Despublicar' : 'Publicar'}
          </button>
        </form>
      </section>

      <section className="mt-14">
        <h2 className="t-label border-rule border-b pb-2">Versión restaurada con IA</h2>
        <p className="t-intro text-muted mt-4">
          Una versión restaurada con IA es una interpretación, no el documento: se guarda aparte y
          el sitio siempre abre en la original.
        </p>

        {photo.restoredMasterKey ? (
          <>
            <dl className="border-rule mt-5 border-t">
              <Row label="Método">{photo.restoredMethod ?? '—'}</Row>
              <Row label="Adjuntada">
                {photo.restoredAt ? photo.restoredAt.toISOString().slice(0, 10) : '—'}
              </Row>
              <Row label="En el sitio">
                {photo.restoredWebKey ? 'sí' : 'no (la fotografía está despublicada)'}
              </Row>
            </dl>
            {/* The stored thumbnail key rather than a width computed from the
                original: a restoration is derived from its own master, so its
                renditions are its own and only this key is certain to exist. */}
            {photo.restoredThumbKey && (
              // eslint-disable-next-line @next/next/no-img-element -- same as above.
              <img
                src={publicUrl(photo.restoredThumbKey)}
                alt=""
                className="mount mt-5 max-h-80 w-auto max-w-full object-contain"
              />
            )}
            <form action={removeRestoration} className="mt-5">
              <input type="hidden" name="slug" value={photo.slug} />
              <button type="submit" className={BUTTON}>
                Quitar versión restaurada
              </button>
            </form>
          </>
        ) : (
          <p className="t-meta mt-5">Esta fotografía no tiene versión restaurada.</p>
        )}

        <form action={attachRestoration} className="mt-8 grid max-w-lg gap-5">
          <input type="hidden" name="slug" value={photo.slug} />
          {/* Not a `Field`: that puts its hint under the control, and under a
              preview the size of a thumbnail the hint lands nowhere near what it
              is describing. Here it sits between the label and the button. */}
          <div>
            <span className="t-label block pb-1.5">
              {photo.restoredMasterKey ? 'Reemplazar por' : 'Adjuntar archivo'}
            </span>
            <span className="t-meta mb-3 block">
              JPEG, PNG, WebP o TIFF, hasta 3,5 MB. Se guarda aparte, así que no se pierde si
              despublicás la fotografía.
            </span>
            {/* Keyed on the outcome, so the redirect that announces a successful
                upload also remounts the picker. Without it React reconciles the
                same tree position, the file input keeps its file and the preview
                its thumbnail, and pressing the button again re-uploads it. */}
            <FilePicker
              key={one(params.ok) || one(params.error) || 'nuevo'}
              name="file"
              accept="image/*"
            />
          </div>
          <Field label="Método" hint="Con qué se restauró, para que quede asentado.">
            <input
              type="text"
              name="method"
              defaultValue={photo.restoredMethod ?? ''}
              className={FIELD}
            />
          </Field>
          <button type="submit" className={`${BUTTON} justify-self-start`}>
            {photo.restoredMasterKey
              ? 'Reemplazar versión restaurada'
              : 'Adjuntar versión restaurada'}
          </button>
        </form>
      </section>

      <section className="mt-14">
        <h2 className="t-label border-rule border-b pb-2">Archivo</h2>
        <dl className="border-rule mt-1 border-t">
          <Row label="Secciones">
            {photo.sections.length ? photo.sections.map((s) => s.name).join(', ') : '—'}
          </Row>
          <Row label="Master">
            {photo.masterSource === 'drive' ? 'Drive' : 'rescatado de Sites'} · {photo.masterWidth}×
            {photo.masterHeight}
          </Row>
          <Row label="Copia web">
            {photo.webKey ? `${photo.webWidth}×${photo.webHeight}` : 'sin derivadas'}
          </Row>
        </dl>
      </section>
    </>
  )
}
