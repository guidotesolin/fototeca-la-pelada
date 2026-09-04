import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPhotoForEdit, photoTranslations, restoredFromDrive } from '@/db/queries/admin'
import { requireAdmin } from '@/lib/auth'
import { RESTORED_FOLDER_NAME, listImages, restoredFolder } from '@/lib/drive'
import { keyFor, publicUrl } from '@/lib/photo'
import { Back, BUTTON, Check, FIELD, Field, Notice, Row, one } from '../../ui'
import {
  attachRestoration,
  attachRestorationFromDrive,
  removeRestoration,
  saveDetails,
  setPublished,
} from '../actions'
import { TakedownHelp } from '../../takedown-help'
import { FilePicker } from '../file-picker'
import { TARGET_LOCALES } from '../../translations/items'
import { proposalsFor } from '../../translations/proposals'
import { TranslationsFor } from '../../translations/row'

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

/**
 * Attaching a restoration from Drive is a master download plus six encodes plus
 * six uploads, the same shape of work the import screen does and the same reason
 * it raises this: the default ten seconds is not enough for it, and the rest of
 * the screen is unaffected by the ceiling being higher.
 */
export const maxDuration = 60

export default async function EditPhoto(props: PageProps<'/admin/photos/[slug]'>) {
  await requireAdmin()
  const { slug } = await props.params
  const photo = await getPhotoForEdit(slug)
  if (!photo) notFound()

  const params = await props.searchParams
  // What the other three languages already say about this photograph, and what
  // the machine proposed for whichever of them is still empty.
  const stored = await photoTranslations(slug)
  const proposals = Object.fromEntries(TARGET_LOCALES.map((l) => [l, proposalsFor(l)]))

  /**
   * The web copy when there is one, the master when there is not -- which is what
   * an unpublished photograph looks like, since the takedown deleted every
   * derivative. Seeing what you are about to put back is the point.
   */
  /**
   * The restorations folder, and only when it is asked for.
   *
   * **Two Drive calls behind a link, rather than on every render.** This screen is
   * opened to write a caption far more often than to attach a restoration, and
   * `listFolders` + `listImages` on each of those renders would spend the service
   * account's quota on a panel nobody was looking at. The import screen makes the
   * same bargain with its own `?folder=`: nothing is listed until a folder is
   * chosen.
   */
  const wantsDrive = one(params.restaurar) === 'drive'
  const folder = wantsDrive ? await restoredFolder() : null
  const [driveFiles, usedBy] = folder
    ? await Promise.all([listImages(folder.id), restoredFromDrive()])
    : [[], new Map<string, string>()]
  // By name, because Drive's own order is not one and the brothers scan in batches
  // whose filenames run together.
  const sorted = [...driveFiles].sort((a, b) => a.name.localeCompare(b.name, 'es'))

  const preview = photo.webKey
    ? publicUrl(keyFor(photo.webKey, photo.webWidth ?? 480, 'webp'))
    : photo.masterKey
      ? publicUrl(photo.masterKey)
      : null

  return (
    <>
      <Back href="/admin/photos" label="Fotografías" />

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

        {/* Inside this form on purpose: one Guardar saves the Spanish and the
            three languages together, in one transaction. See `TranslationsFor`. */}
        <TranslationsFor
          id={photo.slug}
          kinds={['caption', 'notes']}
          source={{ caption: photo.caption ?? '', notes: photo.notes ?? '' }}
          stored={stored}
          proposals={proposals}
        />

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

        {/* Only while it is hidden, because only then is there something left to
            do. On a published photograph this would be a panel announcing a next
            step that does not exist, which is how a panel teaches you to ignore it. */}
        {!photo.published && <TakedownHelp slug={photo.slug} />}
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

        {/* One way in at a time. The two forms used to sit one under the other, and
            a screen that offers both is asking a question it has already answered:
            the restoration comes from Drive or from this machine, never from both.
            `?restaurar=` is the switch, so the choice is in the address -- no client
            state, it survives a reload, and the Drive listing stays behind a click.

            Drive is on the left because it is where the restorations actually land
            and it is the one without the 3,5 MB ceiling a server action body
            imposes. The file is what opens, for the reason `wantsDrive` is written
            around: listing the folder is two Drive calls, and this screen is opened
            to write a caption far more often than to attach a restoration. */}
        <div className="mt-8 flex max-w-lg gap-1.5">
          {[
            {
              label: 'Desde Drive',
              href: `/admin/photos/${photo.slug}?restaurar=drive`,
              active: wantsDrive,
            },
            { label: 'Subir un archivo', href: `/admin/photos/${photo.slug}`, active: !wantsDrive },
          ].map(({ label, href, active }) => (
            <Link
              key={href}
              href={href}
              /* Not colour alone: `aria-current` is what marks the open one for a
                 reader who does not see the border (WCAG 1.4.1). The text keeps
                 `.t-label`'s own colour in both -- it is unlayered author CSS, so a
                 `text-accent` here would lose to it and do nothing. */
              aria-current={active ? 'true' : undefined}
              className={`t-label focus-visible:outline-focus flex h-11 flex-1 items-center justify-center border text-center focus-visible:outline-2 focus-visible:-outline-offset-2 ${
                active ? 'border-accent bg-surface-high' : 'border-rule hover:border-accent'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {wantsDrive ? (
          !folder ? (
            <p className="t-intro text-muted mt-5">
              No encontramos una carpeta «{RESTORED_FOLDER_NAME}» dentro de la carpeta de originales
              de Drive. Revisá que exista y que se llame así.
            </p>
          ) : sorted.length === 0 ? (
            <p className="t-intro text-muted mt-5">
              La carpeta «{RESTORED_FOLDER_NAME}» no tiene imágenes.
            </p>
          ) : (
            <form action={attachRestorationFromDrive} className="mt-5">
              <input type="hidden" name="slug" value={photo.slug} />
              <p className="t-meta">
                {sorted.length} {sorted.length === 1 ? 'imagen' : 'imágenes'} · tocá una y después
                «Adjuntar la elegida». Los nombres los pone quien exporta, así que la miniatura es
                lo que dice cuál es.
              </p>

              {/* A radio and not a checkbox: a photograph has one restored version,
                  and the control should say so rather than accept two and complain.
                  `has-[:checked]:` marks the choice on the frame, so what is ticked
                  is legible without hunting for a small dot. */}
              <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {sorted.map((file) => {
                  const owner = usedBy.get(file.id)
                  return (
                    <li key={file.id}>
                      <label className="has-[:checked]:outline-accent border-rule hover:bg-surface flex h-full cursor-pointer flex-col gap-2 border p-2 has-[:checked]:outline-2">
                        <span className="flex items-start gap-2">
                          <input
                            type="radio"
                            name="file-id"
                            value={file.id}
                            className="accent-accent focus-visible:outline-focus mt-0.5 h-4 w-4 shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2"
                          />
                          <span className="t-meta min-w-0 grow break-all">
                            {file.size !== null &&
                              `${Math.round(file.size / 1024).toLocaleString('es-AR')} KB`}
                          </span>
                        </span>
                        {/* Drive's own thumbnail, signed and short-lived: the screen
                            is rendered per request, so the link in the markup is
                            always minutes old. `object-contain` for the same reason
                            the import screen uses it -- a square crop of an unknown
                            scan hides the half that would have told you which it is. */}
                        {file.thumbnailLink ? (
                          /* A signed lh3 URL that expires in an hour is not something to
                             put through the image optimiser's cache. */
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={file.thumbnailLink}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                            className="bg-surface h-32 w-full object-contain"
                          />
                        ) : (
                          <span className="bg-surface text-muted flex h-32 w-full items-center justify-center text-center font-sans text-[10px]">
                            sin vista
                          </span>
                        )}
                        <span className="t-meta block break-all">{file.name}</span>
                        {/* Advisory, and it says whose rather than just "taken": the
                            useful question when a file is already attached is which
                            ficha to go and look at. Reattaching stays allowed -- a
                            better pass of the same source is the ordinary case. */}
                        {owner && (
                          <span className="t-meta text-accent block">
                            {owner === photo.slug ? 'es la de esta ficha' : `ya es la de ${owner}`}
                          </span>
                        )}
                      </label>
                    </li>
                  )
                })}
              </ul>

              <button type="submit" className={`${BUTTON} mt-6`}>
                Adjuntar la elegida
              </button>
            </form>
          )
        ) : (
          <form action={attachRestoration} className="mt-5 grid max-w-lg gap-5">
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
            <button type="submit" className={`${BUTTON} justify-self-start`}>
              {photo.restoredMasterKey
                ? 'Reemplazar versión restaurada'
                : 'Adjuntar versión restaurada'}
            </button>
          </form>
        )}
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
