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
 * The takedown order is the part worth reading twice: **R2 first, the row after**.
 * If the delete fails, nothing changed and the action can be retried. If the row
 * update fails after the files are gone, the photograph shows up broken, which is
 * loud, and retrying finishes the job. The other order can null the keys while the
 * files stay, and then the takedown is a lie nobody can see.
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
    })
  })
  redirect(`/admin/photos/${slug}?${result}`)
}

/**
 * The takedown, and undoing it. Unpublishing deletes every derivative -- the
 * photograph's and its restoration's -- and nulls the keys, so nothing in the
 * database points at a file that is not there. Publishing reads the masters back
 * -- from R2 or from Drive, whichever holds this one -- and derives again under a
 * **new** random prefix: the addresses a takedown killed stay dead.
 *
 * No master is ever deleted here. That is what makes a takedown reversible, and
 * it is why the restoration needed a `restored_master_key` of its own.
 */
export async function setPublished(form: FormData) {
  await requireAdmin()
  const slug = form.get('slug')
  if (typeof slug !== 'string' || !SLUG.test(slug)) redirect('/admin/photos?error=no-existe')
  const publishing = form.get('published') === 'true'

  const result = await outcome('photos', publishing ? 'publicado' : 'despublicado', async () => {
    const row = await load(slug)

    if (!publishing) {
      // R2 first: while the keys are still in the row, this is retryable.
      await dropDerivatives(row.webKey)
      await dropDerivatives(row.restoredWebKey)
      await db
        .update(photo)
        .set({
          published: false,
          webKey: null,
          webWidth: null,
          webHeight: null,
          thumbKey: null,
          restoredWebKey: null,
          restoredWebWidth: null,
          restoredWebHeight: null,
          restoredThumbKey: null,
        })
        .where(eq(photo.id, row.id))
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
 * of its own for the same reason the photograph has one -- without it a takedown
 * would delete its derivatives and republishing could not bring them back, so
 * unpublishing would destroy somebody's retouching.
 *
 * Derivatives are generated only if the photograph is published. An unpublished
 * one has none by definition, and giving it half a set would put a live URL back
 * on a photograph that was taken down.
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
