'use server'

import { eq, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { category, photo, photoTranslation } from '@/db/schema'
import { requireAdmin } from '@/lib/auth'
import {
  dropDerivatives,
  dropRestoredMaster,
  generate,
  hasMaster,
  readMaster,
} from '@/lib/derivatives'
import { read } from '@/lib/images'
import { masterKeyFor } from '@/lib/photo'
import { getBytes, newPrefix, put } from '@/lib/r2'
import { readTranslations } from '../translations/items'
import { writeTranslations } from '../translations/save'
import { Invalid, outcome } from '../write'

/**
 * Every write the photo screens make. Two rules hold across all of them:
 *
 * - **`requireAdmin()` first, always.** A server action is a POST endpoint with a
 *   public URL, so hiding the button that calls it hides nothing. The layout above
 *   these screens is chrome and says so itself, so the gate is here, per action.
 * - **Everything from the form is validated on the server.** The administrators
 *   are trusted with the archive, which is not the same as being trusted to have
 *   sent a well-formed year.
 *
 * **Nothing here deletes a photograph's files.** Once an image is in the bucket it
 * stays: unpublishing hides it from the site and leaves every rendition where it
 * is, which is the archive's rule as of this change -- a photograph that took work
 * to find is not something the panel gets to destroy. The only deletes left in
 * this file are rollbacks: files written by the operation that is failing, which
 * no row will ever name, and leaving those behind is not preservation but litter.
 *
 * What that costs is stated where it is decided, in _Exposure, indexing and
 * takedown on request_ in ARCHITECTURE.md: a rendition keeps answering at its own
 * URL after the photograph is hidden, because the bucket serves it directly and
 * `published` is something only the site reads. Making a hidden photograph
 * unreachable is bucket configuration, not a delete.
 */

/** Longest we accept per kind of field. A caption can be a paragraph; a credit cannot. */
const LIMITS = { caption: 4000, notes: 4000, line: 300, method: 200 }

/** The archive's own floor. This is a photographic archive, not a chronicle of antiquity. */
const EARLIEST = 1800

/** The shape the seed writes and the schema caps at 64: a permanent identifier. */
const SLUG = /^[a-z0-9-]{1,64}$/

function line(form: FormData, name: string, max: number): string | null {
  const raw = form.get(name)
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value) return null
  if (value.length > max) throw new Invalid('largo')
  return value
}

function flag(form: FormData, name: string): boolean {
  return form.get(name) !== null
}

/** Both years at once, because half of what makes them valid is their relation. */
function years(form: FormData): { yearFrom: number | null; yearTo: number | null } {
  const latest = new Date().getFullYear() + 1
  const read = (name: string) => {
    const raw = form.get(name)
    if (typeof raw !== 'string' || !raw.trim()) return null
    if (!/^\d{1,4}$/.test(raw.trim())) throw new Invalid('anios')
    const value = Number(raw.trim())
    if (value < EARLIEST || value > latest) throw new Invalid('anios')
    return value
  }
  const yearFrom = read('yearFrom')
  const yearTo = read('yearTo')
  // A range that starts nowhere, or ends before it begins, is not a range.
  if (yearTo !== null && yearFrom === null) throw new Invalid('anios')
  if (yearFrom !== null && yearTo !== null && yearTo < yearFrom) throw new Invalid('anios')
  return { yearFrom, yearTo }
}

/** The row an action works on, read by slug. The form never gets to name a row id. */
async function load(slug: string) {
  const [row] = await db.select().from(photo).where(eq(photo.slug, slug)).limit(1)
  if (!row) throw new Invalid('no-existe')
  return row
}

/** Caption, credit, the research fields and the two flags. No file ever moves here. */
export async function saveDetails(form: FormData) {
  await requireAdmin()
  const slug = form.get('slug')
  if (typeof slug !== 'string' || !SLUG.test(slug)) redirect('/admin/photos?error=no-existe')

  const result = await outcome('photos', 'guardado', async () => {
    const row = await load(slug)
    const { yearFrom, yearTo } = years(form)
    const caption = line(form, 'caption', LIMITS.caption)
    const notes = line(form, 'notes', LIMITS.notes)
    const credit = line(form, 'credit', LIMITS.line)
    const source = line(form, 'source', LIMITS.line)
    const place = line(form, 'place', LIMITS.line)
    // The other three languages, from the same form and the same button. Read
    // before the transaction opens, so a rejected translation cannot leave the
    // Spanish half saved -- the rule this file already holds itself to.
    const translations = readTranslations(form)

    await db.transaction(async (tx) => {
      await tx
        .update(photo)
        .set({
          credit,
          source,
          place,
          yearFrom,
          yearTo,
          sensitive: flag(form, 'sensitive'),
          featured: flag(form, 'featured'),
        })
        .where(eq(photo.id, row.id))
      // The Spanish row is the source language and it may not exist yet: 73 of the
      // 592 arrived with no caption at all (F1), which is half of what this screen
      // is for. `search_vector` is filled by the trigger either way.
      await tx
        .insert(photoTranslation)
        .values({ photoId: row.id, locale: 'es', caption, notes })
        .onConflictDoUpdate({
          target: [photoTranslation.photoId, photoTranslation.locale],
          set: { caption, notes },
        })
      await writeTranslations(tx, translations)
    })
  })
  redirect(`/admin/photos/${slug}?${result}`)
}

/**
 * Hiding a photograph from the site, and putting it back. **One boolean, and no
 * file is touched in either direction.**
 *
 * It used to be a takedown: unpublishing deleted every rendition and nulled the
 * keys, and publishing derived the whole set again from the master under a new
 * random prefix. The archive's rule is now that nothing it has is ever deleted, so
 * the renditions stay and coming back is the flag flipping. What that gives up is
 * the one thing the delete bought -- see the note at the top of this file.
 *
 * The generate-from-master branch below is **not** dead code, and it is not there
 * for old rows either. `attachRestoration` deliberately derives nothing while the
 * photograph is hidden, so a restoration attached in that state has a master and
 * no renditions until this action publishes; and an import that failed midway
 * leaves a row whose own renditions were rolled back. Both arrive here with a null
 * key and a master to read, which is exactly what it handles.
 */
export async function setPublished(form: FormData) {
  await requireAdmin()
  const slug = form.get('slug')
  if (typeof slug !== 'string' || !SLUG.test(slug)) redirect('/admin/photos?error=no-existe')
  const publishing = form.get('published') === 'true'

  const result = await outcome('photos', publishing ? 'publicado' : 'despublicado', async () => {
    const row = await load(slug)

    if (!publishing) {
      // The keys stay. They are what makes publishing again a flag flip rather
      // than six encodes and six uploads off a master that may live in Drive.
      await db.update(photo).set({ published: false }).where(eq(photo.id, row.id))
      return
    }

    /**
     * Republishing reads from the master, because the master is the document --
     * and **where the master lives is not one place**. This used to ask for
     * `master_key`, which is R2, and every photograph in the archive had one
     * because all 592 were rescued from Sites. A photograph imported from Drive
     * has `master_key` null and `drive_file_id` set, by design: the masters stay
     * in Drive because 600 high-resolution scans do not fit in R2's free 10 GB.
     * So the check refused it and the read would have dereferenced a null --
     * one could be unpublished and then never published again. `readMaster` is
     * the one door to a master's bytes, and `hasMaster` is exactly its negation.
     */
    if (!row.webKey && !hasMaster(row)) throw new Invalid('sin-master')

    /**
     * Everything that writes to R2 is inside the rollback, not only the database
     * update. A throw from the second `generate()` used to leave the first one's
     * renditions in the bucket with no row naming them -- unreachable, so the
     * panel could never delete them, and `db:seed:verify` red for ever.
     */
    let web: Awaited<ReturnType<typeof generate>> | null = null
    let restored: Awaited<ReturnType<typeof generate>> | null = null
    try {
      if (!row.webKey) web = await generate(slug, await readMaster(row))
      if (row.restoredMasterKey && !row.restoredWebKey) {
        restored = await generate(`${slug}-restaurada`, await getBytes(row.restoredMasterKey))
      }
      await db
        .update(photo)
        .set({
          published: true,
          ...(web && {
            webKey: web.webKey,
            webWidth: web.webWidth,
            webHeight: web.webHeight,
            thumbKey: web.thumbKey,
          }),
          ...(restored && {
            restoredWebKey: restored.webKey,
            restoredWebWidth: restored.webWidth,
            restoredWebHeight: restored.webHeight,
            restoredThumbKey: restored.thumbKey,
          }),
        })
        .where(eq(photo.id, row.id))
    } catch (error) {
      await dropDerivatives(web?.webKey)
      await dropDerivatives(restored?.webKey)
      throw error
    }
  })
  redirect(`/admin/photos/${slug}?${result}`)
}

/**
 * Attaches a restoration: an interpretation, never the document. It gets a master
 * of its own, which is the same rule the photograph follows -- what is uploaded is
 * kept, and everything else about it is derived.
 *
 * Derivatives are generated only if the photograph is published, and now for a
 * plainer reason than before: they are work, and a hidden photograph has nothing
 * to show them on. `setPublished` derives them when it is published, which is the
 * branch its own note points at.
 */
export async function attachRestoration(form: FormData) {
  await requireAdmin()
  const slug = form.get('slug')
  if (typeof slug !== 'string' || !SLUG.test(slug)) redirect('/admin/photos?error=no-existe')

  const result = await outcome('photos', 'restaurada', async () => {
    const row = await load(slug)
    const method = line(form, 'method', LIMITS.method)

    const file = form.get('file')
    // Told apart on purpose: "you did not choose one" and "this one is not usable"
    // are different mistakes, and one message for both sends somebody looking for
    // a problem with a file they never picked.
    if (!(file instanceof File) || file.size === 0) throw new Invalid('sin-archivo')
    const data = Buffer.from(await file.arrayBuffer())

    // What the bytes are, read from the bytes: never the extension, never the
    // content type the browser claimed. `read` also enforces the size ceiling.
    let master
    try {
      master = await read(data)
    } catch (error) {
      console.error('[admin/photos] the upload is not a usable image:', error)
      throw new Invalid('archivo')
    }

    const ext = master.format === 'jpeg' ? 'jpg' : master.format
    const masterKey = masterKeyFor(newPrefix('masters', `${slug}-restaurada`), ext)

    // Every write to R2 sits inside the rollback: the master upload used to be
    // outside it, so a failure while deriving stranded a master no row named.
    let made: Awaited<ReturnType<typeof generate>> | null = null
    try {
      await put(masterKey, data, ext)
      if (row.published) made = await generate(`${slug}-restaurada`, data)
      await db
        .update(photo)
        .set({
          restoredMasterKey: masterKey,
          restoredWebKey: made?.webKey ?? null,
          restoredWebWidth: made?.webWidth ?? null,
          restoredWebHeight: made?.webHeight ?? null,
          restoredThumbKey: made?.thumbKey ?? null,
          restoredMethod: method,
          restoredAt: new Date(),
          // A restoration that arrives by hand replaces one that came from Drive,
          // so the Drive id stops describing this row's source.
          restoredDriveFileId: null,
        })
        .where(eq(photo.id, row.id))
    } catch (error) {
      await dropDerivatives(made?.webKey)
      await dropRestoredMaster(masterKey)
      throw error
    }

    /**
     * The old files, once the row points at the new ones. Outside the failing
     * path on purpose: the write has already succeeded, so a transient R2 error
     * here must not report `error=interno` for a save that happened, and must
     * not skip the revalidation either. What it leaves behind is an orphan, and
     * an orphan is what `db:seed:verify` is for.
     */
    try {
      await dropDerivatives(row.restoredWebKey)
      await dropRestoredMaster(row.restoredMasterKey)
    } catch (error) {
      console.error('[admin/photos] the replaced restoration could not be deleted:', error)
    }
  })
  redirect(`/admin/photos/${slug}?${result}`)
}

/** Removes the restoration entirely: files first, then the fields that name them. */
export async function removeRestoration(form: FormData) {
  await requireAdmin()
  const slug = form.get('slug')
  if (typeof slug !== 'string' || !SLUG.test(slug)) redirect('/admin/photos?error=no-existe')

  const result = await outcome('photos', 'restauracion-quitada', async () => {
    const row = await load(slug)
    await dropDerivatives(row.restoredWebKey)
    await dropRestoredMaster(row.restoredMasterKey)
    await db
      .update(photo)
      .set({
        restoredMasterKey: null,
        restoredWebKey: null,
        restoredWebWidth: null,
        restoredWebHeight: null,
        restoredThumbKey: null,
        restoredMethod: null,
        restoredAt: null,
        restoredDriveFileId: null,
      })
      .where(eq(photo.id, row.id))
  })
  redirect(`/admin/photos/${slug}?${result}`)
}

/**
 * Curatorial order within one section, saved as one statement. Every position is
 * scoped to the section the form named, so an id belonging to another section
 * matches no row and moves nothing.
 *
 * ponytail: numbers in a form, not drag and drop. It works with JavaScript off and
 * on a phone, and it took no library. Reach for dragging when somebody actually
 * asks to reorder a hundred photographs by hand.
 */
export async function saveOrder(form: FormData) {
  await requireAdmin()
  const section = form.get('section')
  if (typeof section !== 'string' || !SLUG.test(section)) redirect('/admin/photos?error=orden')
  const page = form.get('page')
  const back = `/admin/photos?seccion=${section}${typeof page === 'string' && /^\d{1,4}$/.test(page) ? `&p=${page}` : ''}`

  const result = await outcome('photos', 'orden', async () => {
    const [found] = await db
      .select({ id: category.id })
      .from(category)
      .where(eq(category.slug, section))
      .limit(1)
    if (!found) throw new Invalid('orden')

    const ids = form.getAll('id')
    const positions = form.getAll('position')
    if (ids.length === 0 || ids.length !== positions.length) throw new Invalid('orden')

    const pairs = ids.map((id, index) => {
      const position = positions[index]
      if (typeof id !== 'string' || typeof position !== 'string') throw new Invalid('orden')
      if (!/^\d{1,9}$/.test(id) || !/^\d{1,6}$/.test(position)) throw new Invalid('orden')
      return sql`(${Number(id)}::int, ${Number(position)}::int)`
    })

    await db.execute(sql`
      update photo_category set position = v.position
      from (values ${sql.join(pairs, sql`, `)}) as v(photo_id, position)
      where photo_category.photo_id = v.photo_id
        and photo_category.category_id = ${found.id}
    `)
  })
  redirect(`${back}&${result}`)
}
