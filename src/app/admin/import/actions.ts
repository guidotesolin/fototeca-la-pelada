'use server'

import { createHash } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { importedFromDrive, nextPhotoSlug } from '@/db/queries/admin'
import { SOURCE_LOCALE } from '@/db/queries/gallery'
import { category, photo, photoCategory, photoTranslation } from '@/db/schema'
import { requireAdmin } from '@/lib/auth'
import { dropDerivatives, generate } from '@/lib/derivatives'
import { download, isFileId, isInsideFolder, listImages, mastersFolderId } from '@/lib/drive'
import { MAX_BYTES, read } from '@/lib/images'
import { isSectionSlug } from '@/lib/slug'
import { Invalid, outcome } from '../write'

/**
 * The bridge from the preservation vault to the site: one photograph, from Drive
 * to a row with its derivatives in R2.
 *
 * **One photograph per request, and that is the design, not a limitation.**
 * Downloading a master, encoding six renditions and uploading them takes seconds
 * per photograph, so a folder in a single request does not finish before the
 * function's duration limit -- 60 s on Vercel Hobby, declared as `maxDuration` on
 * the page. So the request imports the *first pending* file and comes back, and
 * the screen decides whether to ask for another. That makes it resumable for
 * free: what is pending is derived from the database on every render, so closing
 * the tab, losing the connection or a timeout on photograph forty costs the
 * forty-first, not the forty before it.
 *
 * No queue and no job system. There is nothing to persist -- Drive holds the
 * work list and `drive_file_id` holds the progress.
 *
 * The two rules T10's actions set hold here unchanged:
 *
 * - **`requireAdmin()` first, always.** A server action is a POST endpoint with a
 *   public URL, so hiding the button that calls it hides nothing.
 * - **Everything from the form is validated on the server.** And here also
 *   everything from **Drive**: a file in a shared folder is untrusted input, its
 *   declared `mimeType` included.
 */

/**
 * Which folders the panel will read. The masters folder and the folders inside
 * it, and nothing else -- the id arrives from a form, so what stops it naming
 * some other folder the service account happens to see is a check on the server.
 *
 * Asked of the candidate rather than of the root: reading one file's `parents`
 * is a single cheap lookup, where listing the root's folders to search it is a
 * full `files.list` charged once per imported photograph.
 */
async function reachable(folderId: string): Promise<boolean> {
  const root = mastersFolderId()
  return folderId === root || isInsideFolder(folderId, root)
}

/**
 * Imports the first file in the folder that has no row yet, and reports back
 * through the query string like every other write in the panel.
 *
 * **`published: true`**, which is what makes the acceptance criterion true --
 * a record with its derivatives in R2 -- and what keeps the archive's one
 * invariant: an unpublished photograph has no derivatives, because a takedown
 * deletes them. It arrives with no caption and no credit, which is the state 73
 * of the original 592 are in, and the "Sin epígrafe" filter is where they get
 * written. If it should not be on the site yet, **Despublicar** is one click and
 * now works for a Drive master too.
 */
export async function importNext(form: FormData) {
  await requireAdmin()

  const folder = form.get('folder')
  const section = form.get('section')
  // A submit button's name reaches the form data only when it was the one
  // pressed, so this is how "Importar todas" says so without a line of script.
  const auto = form.get('auto') === '1'
  if (!isFileId(folder) || !isSectionSlug(section)) redirect('/admin/import?error=carpeta')
  const back = `/admin/import?folder=${folder}&section=${section}`

  const result = await outcome('import', 'importada', async () => {
    if (!(await reachable(folder))) throw new Invalid('carpeta')

    const [found] = await db
      .select({ id: category.id })
      .from(category)
      .where(eq(category.slug, section))
      .limit(1)
    if (!found) throw new Invalid('seccion-no-existe')

    const [files, already] = await Promise.all([listImages(folder), importedFromDrive()])
    const next = files.find((f) => !already.has(f.id))
    if (!next) throw new Invalid('nada-pendiente')

    // What Drive says it weighs, checked before the bandwidth is spent. The real
    // ceiling is on the bytes as they arrive, in `lib/drive.ts`, because this
    // number is metadata and metadata is a claim.
    if (next.size !== null && next.size > MAX_BYTES) throw new Invalid('archivo-grande')

    const data = await download(next.id)

    /**
     * What the bytes actually are, read from the bytes. Never the extension,
     * never the `mimeType` Drive reported: the folder is somebody's directory
     * and anything can be dropped in it. `read` also refuses what sharp cannot
     * decode, and enforces the size ceiling a second time.
     *
     * ponytail: a file this refuses **blocks the folder** -- the next request
     * picks the same first pending file and fails the same way, so the run stops
     * until somebody takes it out of Drive. Both messages say exactly that, and
     * the screen's list is anchored on that file so it is on screen. Skipping it
     * instead would mean remembering which files failed, which is the queue this
     * design exists without. Revisit if a folder ever arrives with junk in it.
     */
    let master
    try {
      master = await read(data)
    } catch (error) {
      console.error(`[admin/import] "${next.name}" is not a usable image:`, error)
      throw new Invalid('imagen')
    }

    const sha256 = createHash('sha256').update(data).digest('hex')
    const slug = await nextPhotoSlug(section)

    /**
     * R2 before the row, and the rollback covers both: a throw after the
     * renditions are uploaded would leave six files under a prefix no row names,
     * which is the orphan `db:seed:verify` refuses to tolerate. The master is
     * **not** copied to R2 -- it stays in Drive, which is the whole point of the
     * split, and `drive_file_id` is how it is read back.
     */
    let made: Awaited<ReturnType<typeof generate>> | null = null
    try {
      const web = (made = await generate(slug, data))
      await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(photo)
          .values({
            slug,
            published: true,
            masterSource: 'drive',
            driveFileId: next.id,
            masterKey: null,
            masterWidth: master.width,
            masterHeight: master.height,
            masterBytes: master.bytes,
            masterSha256: sha256,
            webKey: web.webKey,
            webWidth: web.webWidth,
            webHeight: web.webHeight,
            thumbKey: web.thumbKey,
          })
          .returning({ id: photo.id })

        // The Spanish row with nothing in it, so `photo` and its source-language
        // translation stay 1:1 across the archive: T15's editor has to tell "no
        // Spanish text yet" from "no row", and the seed wrote one for all 592.
        await tx.insert(photoTranslation).values({ photoId: row.id, locale: SOURCE_LOCALE })

        // Last in the section, which is where a photograph that arrives today
        // belongs until somebody orders it by hand.
        const [{ position }] = await tx
          .select({ position: sql<number>`coalesce(max(${photoCategory.position}), 0) + 1` })
          .from(photoCategory)
          .where(eq(photoCategory.categoryId, found.id))
        await tx.insert(photoCategory).values({ photoId: row.id, categoryId: found.id, position })
      })
    } catch (error) {
      await dropDerivatives(made?.webKey)
      throw error
    }
  })

  // `auto` is carried only on the way out of a success, so the loop the screen
  // runs stops at the first thing that goes wrong instead of hammering Drive.
  redirect(`${back}&${result}${auto && result.startsWith('ok=') ? '&auto=1' : ''}`)
}
