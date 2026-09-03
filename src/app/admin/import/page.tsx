import Link from 'next/link'
import type { Metadata } from 'next'
import { importedFromDrive, listCategories } from '@/db/queries/admin'
import { requireAdmin } from '@/lib/auth'
import { isFileId, listFolders, listImages, mastersFolderId } from '@/lib/drive'
import type { DriveFile } from '@/lib/drive'
import { isSectionSlug } from '@/lib/slug'
import { BUTTON, CONTROL, Notice, one } from '../ui'
import { importNext } from './actions'
import { AutoContinue } from './auto-continue'

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
 * in one request does not finish inside the function's duration limit. The
 * action imports the first pending file and returns; what is pending is worked
 * out from the database on every render, which is what makes it resumable -- and
 * what makes re-importing a no-op.
 *
 * Spanish, and never translated: only the two of them use it.
 */

/**
 * Vercel Hobby's ceiling, and the reason one photograph per request is the
 * design. Per the route segment config, this covers the server actions invoked
 * from this page, which is where the seconds are actually spent.
 */
export const maxDuration = 60

/** Enough rows to see what is happening without printing the whole vault. */
const SHOWN = 60

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
   * The window is anchored on the **first pending file** rather than on the top
   * of the folder: after sixty imports a list that always started at row one
   * would show sixty photographs that are already in and none of the ones about
   * to arrive, which is the half worth watching.
   */
  const frontier = rows.findIndex((r) => !r.slug)
  const from = frontier < 0 ? Math.max(0, rows.length - SHOWN) : Math.max(0, frontier - 3)
  const shown = rows.slice(from, from + SHOWN)

  return (
    <>
      <Link
        href="/admin"
        className="t-credit link text-muted hover:text-text focus-visible:outline-focus inline-block py-1.5 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        ← Panel
      </Link>

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
            <button type="submit" className={BUTTON}>
              Ver la carpeta
            </button>
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
              </h2>

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
                  <form action={importNext} className="mt-5 flex flex-wrap items-center gap-3">
                    <input type="hidden" name="folder" value={folder} />
                    <input type="hidden" name="section" value={section} />
                    <button type="submit" className={BUTTON}>
                      Importar una
                    </button>
                    <button type="submit" name="auto" value="1" className={BUTTON}>
                      Importar todas
                    </button>
                    {/* Only after a success, so a failure stops the run instead
                        of retrying the same file against Drive for ever. */}
                    {one(params.auto) === '1' && !one(params.error) && <AutoContinue step={done} />}
                  </form>
                  <p className="t-meta mt-2">
                    «Importar todas» sigue sola hasta terminar, y se puede cerrar la pestaña en
                    cualquier momento. Con el navegador sin JavaScript, cada clic trae una.
                  </p>
                </>
              )}

              <ul className="border-rule mt-8 border-t">
                {shown.map((row) => (
                  <li
                    key={row.id}
                    className="border-rule flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b py-3"
                  >
                    <span className="t-meta min-w-0 break-all">{row.name}</span>
                    <span className="t-meta">
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
                  </li>
                ))}
              </ul>
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
