import Link from 'next/link'
import type { Metadata } from 'next'
import { importedFromDrive, listCategories } from '@/db/queries/admin'
import { requireAdmin } from '@/lib/auth'
import { isFileId, listFolders, listImages, mastersFolderId } from '@/lib/drive'
import type { DriveFile } from '@/lib/drive'
import { isSectionSlug } from '@/lib/slug'
import { Back, CONTROL, Notice, many, one } from '../ui'
import { Submit } from '../submit'
import { importNext } from './actions'
import { AutoContinue } from './auto-continue'
import { Pick } from './pick'

/**
 * Importing from Drive: the screen where a folder of scans becomes rows in the
 * archive with their derivatives in R2.
 *
 * **The masters stay in Drive.** Nothing here copies one to R2 -- 600
 * high-resolution scans do not fit in a free 10 GB, and the split is what the
 * whole storage plan rests on. The row keeps `drive_file_id`, and
 * `readMaster()` is what reads a master back when derivatives have to be
 * regenerated.
 *
 * **One photograph per request, and the screen is the loop.** A master download
 * plus six encodes plus six uploads is seconds per photograph, so a whole folder
 * in one request does not finish inside the function's duration limit. The action
 * imports one pending file and returns; what is pending is worked out from the
 * database on every render, which is what makes it resumable -- and what makes
 * re-importing a no-op.
 *
 * **Nothing is imported that was not pointed at.** "Importar una" took the first
 * pending file and never said so, and "Importar todas" wrote to the archive on one
 * press; both are gone. What is left is one list of boxes and one button that
 * writes: tick the scans -- by hand, or "Elegir todas" -- and then import them.
 * The ticks ride in the address, because the next photograph of a run is a fresh
 * render of this screen.
 *
 * Spanish, and never translated: only the two of them use it.
 */

/**
 * Vercel Hobby's ceiling, and the reason one photograph per request is the
 * design. Per the route segment config, this covers the server actions invoked
 * from this page, which is where the seconds are actually spent.
 */
export const maxDuration = 60

/**
 * Enough rows to see what is happening without printing the whole vault -- and
 * since "Elegir todas" ticks the boxes that are on screen, enough that for every
 * folder in this vault it means every file in the folder. The two biggest are
 * Dandolo at 74 and Teresita at 71 (`npm run drive:smoke` prints the table), so
 * 100 covers them with room; past that the note under the list says how many are
 * not shown, and the next pass of the window reaches them.
 */
const SHOWN = 100

export const metadata: Metadata = { title: 'Importar desde Drive' }

export default async function AdminImport(props: PageProps<'/admin/import'>) {
  await requireAdmin()
  const params = await props.searchParams
  const sections = await listCategories()

  /**
   * Drive can be unconfigured -- the two variables ship as placeholders -- and
   * this screen has to say so rather than crash. The detail goes to the log and
   * not to the page: the panel's convention is that everything an administrator
   * reads is text we wrote, so an error body from Google is not it.
   */
  let root: string | null = null
  let folders: { id: string; name: string }[] = []
  let files: DriveFile[] = []
  let unavailable = false

  const chosen = one(params.folder)
  const wanted = one(params.section)
  const section = sections.some((s) => s.slug === wanted && isSectionSlug(wanted)) ? wanted : ''
  let folder = ''

  /**
   * **Every Drive call on this screen is inside the same guard**, and the
   * folder's own listing especially. An "Importar todas" run re-renders this
   * page once per photograph, so a sixty-image folder makes some hundreds of
   * Drive calls in a couple of minutes and a 429 is a question of when. With
   * the listing outside the guard, that answer threw straight out of the page
   * and the administrator got the framework's error screen mid-run instead of
   * the sentence below, which is written for exactly this.
   */
  try {
    root = mastersFolderId()
    folders = await listFolders(root)
    folder =
      isFileId(chosen) && (chosen === root || folders.some((f) => f.id === chosen)) ? chosen : ''
    if (folder) files = await listImages(folder)
  } catch (error) {
    console.error('[admin/import] Drive did not answer:', error)
    unavailable = true
  }

  const already = folder ? await importedFromDrive() : new Map<string, string>()
  const rows = files.map((f) => ({ ...f, slug: already.get(f.id) ?? null }))
  const done = rows.filter((r) => r.slug).length
  const pending = rows.length - done

  /**
   * The files somebody ticked, carried in the address because the next photograph
   * of a run is a fresh render of this screen and the ticks have to survive it.
   *
   * `waiting` is the run's own remaining work, and it is the ticked files that are
   * **still pending**: one that is now in the archive is finished, so it drops out
   * by itself and the loop below stops when the list empties. No queue anywhere.
   */
  const ticked = new Set(many(params.files).filter(isFileId))
  const waiting = rows.filter((row) => !row.slug && ticked.has(row.id))

  /**
   * The window is anchored on the **first pending file** rather than on the top
   * of the folder: after sixty imports a list that always started at row one
   * would show sixty photographs that are already in and none of the ones about
   * to arrive, which is the half worth watching.
   */
  const frontier = rows.findIndex((r) => !r.slug)
  const from = frontier < 0 ? Math.max(0, rows.length - SHOWN) : Math.max(0, frontier - 3)
  const shown = rows.slice(from, from + SHOWN)

  /**
   * A ticked file the window does not reach. It is still part of the run, and a
   * box that is not rendered is not submitted -- so the window sliding forward as
   * the frontier moves would quietly drop it. It gets a box of its own below,
   * hidden rather than a `type="hidden"` input, so that "todas" and the count both
   * see one kind of control and not two.
   */
  const carried = waiting.filter((row) => !shown.includes(row))
  /** How many boxes the form ends up with, which is what "todas" ticks. */
  const boxes = shown.filter((row) => !row.slug).length + carried.length

  return (
    <>
      <Back />

      <h1 className="t-section mt-4">Importar desde Drive</h1>

      <Notice params={params} />

      <p className="t-intro text-muted mt-6">
        Cada fotografía se importa de a una: se baja el escaneo de Drive, se arman las copias para
        el sitio y se crea la ficha. El original no se mueve de Drive nunca. Se puede cortar y
        seguir después: lo que ya está importado no se vuelve a importar.
      </p>
      <p className="t-intro text-muted mt-4">
        La fotografía entra <strong className="text-text">publicada</strong>, al final de la
        sección, sin epígrafe y sin cortesía. Esos datos se escriben después en{' '}
        <Link href="/admin/photos?filtro=sin-epigrafe" className="link text-accent hover:text-text">
          Fotografías
        </Link>
        . Si preferís revisarla antes de que se vea en el sitio, despublicala desde su ficha.
      </p>

      {unavailable ? (
        <p role="alert" className="bg-surface border-accent t-credit mt-8 border p-4">
          No pudimos hablar con Drive. Puede ser pasajero: si venías importando muchas, esperá unos
          segundos y recargá la página —lo que ya entró quedó guardado—. Si sigue, hay que revisar
          dos cosas en el servidor: que <code>GOOGLE_SERVICE_ACCOUNT_JSON_BASE64</code> tenga la
          clave de la cuenta de servicio en base64, y que la carpeta de originales (
          <code>GOOGLE_DRIVE_MASTERS_FOLDER_ID</code>) esté compartida como lectora con el correo de
          esa cuenta. El detalle quedó en el registro del servidor.
        </p>
      ) : (
        <>
          <form method="get" className="mt-8 flex flex-wrap items-end gap-3">
            <label className="grow basis-56">
              <span className="t-label block pb-1.5">Carpeta de Drive</span>
              <select name="folder" defaultValue={folder} className={CONTROL}>
                <option value="">Elegí una carpeta</option>
                {root && <option value={root}>Originales (la carpeta principal)</option>}
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grow basis-48">
              <span className="t-label block pb-1.5">Sección</span>
              <select name="section" defaultValue={section} className={CONTROL}>
                <option value="">Elegí una sección</option>
                {sections.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <Submit navigates busy="Buscando…">
              Ver la carpeta
            </Submit>
          </form>
          <p className="t-meta mt-2">
            La sección decide en qué galería aparece y de dónde sale el identificador:{' '}
            {section ? `${section}-` : 'seccion-'}
            001, 002, y así. El nombre del archivo en Drive no se usa.
          </p>

          {!folder ? (
            <p className="t-intro text-muted mt-10">
              Elegí una carpeta y una sección para ver qué hay adentro.
            </p>
          ) : (
            <section className="mt-12">
              <h2 className="t-label border-rule border-b pb-2">
                {rows.length} {rows.length === 1 ? 'imagen' : 'imágenes'} · {done} ya{' '}
                {done === 1 ? 'importada' : 'importadas'} · {pending} por importar
                {waiting.length > 0 &&
                  ` · ${waiting.length} ${waiting.length === 1 ? 'elegida' : 'elegidas'}`}
              </h2>

              {/* One form for the picking and the importing both: the boxes are
                  what the buttons send, so the list has to be inside it. */}
              <form action={importNext}>
                <input type="hidden" name="folder" value={folder} />
                <input type="hidden" name="section" value={section} />

                {carried.map((row) => (
                  <input
                    key={row.id}
                    type="checkbox"
                    name="files"
                    value={row.id}
                    defaultChecked
                    hidden
                  />
                ))}

                {pending === 0 ? (
                  <p className="t-intro text-muted mt-5">
                    {rows.length === 0
                      ? 'Esta carpeta no tiene imágenes.'
                      : 'Ya está todo importado de esta carpeta.'}
                  </p>
                ) : !section ? (
                  <p className="t-intro text-muted mt-5">
                    Elegí una sección arriba para poder importar.
                  </p>
                ) : (
                  <>
                    <Pick total={boxes} initial={waiting.length} />
                    {/* Only after a success, so a failure stops the run instead of
                        retrying the same file against Drive for ever -- and only
                        while the run has something left, which is what ends it:
                        the last ticked file going in, whatever else the folder
                        still holds. */}
                    {one(params.auto) === '1' && !one(params.error) && waiting.length > 0 && (
                      <AutoContinue step={done} />
                    )}
                    <p className="t-meta mt-2">
                      Tocá las que quieras —o «Elegir todas»— y después «Importar las elegidas».
                      Entran de a una y la pantalla sigue sola hasta terminar con las elegidas; se
                      puede cerrar la pestaña en cualquier momento. Con el navegador sin JavaScript,
                      cada clic trae una.
                    </p>
                  </>
                )}

                <ul className="border-rule mt-8 border-t">
                  {shown.map((row) => {
                    /* The same row either way. What changes is what wraps it: a
                       pending file is a `<label>`, so the picture itself is the
                       thing you press -- and one already in the archive is not,
                       because its only control is the link to its ficha. */
                    const inside = (
                      <>
                        {/* Drive's own thumbnail, straight from
                            `lh3.googleusercontent.com`: it needs no credentials of
                            ours, so the preview costs the screen nothing but the
                            `<img>` -- no master downloaded, no second Drive call,
                            and nothing of it stored.

                            `object-contain` and not the `object-cover` the other
                            lists use, because this one is read for a different
                            reason: those show a photograph already in the archive,
                            and this is how you tell which scan is which before
                            importing it. A square crop of an unknown scan hides
                            the half that would have told you. */}
                        {row.thumbnailLink ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={row.thumbnailLink}
                            alt=""
                            width={112}
                            height={112}
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                            className="bg-surface h-28 w-28 shrink-0 object-contain"
                          />
                        ) : (
                          <span className="bg-surface text-muted flex h-28 w-28 shrink-0 items-center justify-center text-center font-sans text-[10px] leading-tight">
                            sin vista
                          </span>
                        )}

                        <span className="t-meta min-w-0 grow break-all">{row.name}</span>
                        <span className="t-meta shrink-0 text-right">
                          {row.size !== null &&
                            `${Math.round(row.size / 1024).toLocaleString('es-AR')} KB · `}
                          {row.slug ? (
                            <Link
                              href={`/admin/photos/${row.slug}`}
                              className="link text-accent hover:text-text"
                            >
                              {row.slug}
                            </Link>
                          ) : (
                            'por importar'
                          )}
                        </span>
                      </>
                    )

                    return (
                      <li key={row.id} className="border-rule border-b">
                        {row.slug ? (
                          <div className="flex items-center gap-4 py-3 sm:gap-5">{inside}</div>
                        ) : (
                          <label className="has-[:checked]:bg-surface flex cursor-pointer items-center gap-4 py-3 sm:gap-5">
                            <input
                              type="checkbox"
                              name="files"
                              value={row.id}
                              defaultChecked={ticked.has(row.id)}
                              className="accent-accent focus-visible:outline-focus h-4 w-4 shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2"
                            />
                            {inside}
                          </label>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </form>

              {rows.length > shown.length && (
                <p className="t-meta mt-3">
                  Se ven {shown.length} de {rows.length}
                  {from > 0 && ` · ${from} antes`}
                  {from + shown.length < rows.length &&
                    ` · ${rows.length - from - shown.length} después`}
                  .
                </p>
              )}
            </section>
          )}
        </>
      )}
    </>
  )
}
