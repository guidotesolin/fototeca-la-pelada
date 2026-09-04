'use server'

import { and, eq, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { SOURCE_LOCALE } from '@/db/queries/gallery'
import { category, categoryTranslation, photo, photoCategory } from '@/db/schema'
import { requireAdmin } from '@/lib/auth'
import { isSectionSlug } from '@/lib/slug'
import { readTranslations } from '../translations/items'
import { writeTranslations } from '../translations/save'
import { Invalid, outcome } from '../write'

/**
 * Every write the section screens make. The two rules from T10's actions hold
 * unchanged, and the revalidation they share lives in `../write`:
 *
 * - **`requireAdmin()` first, always.** A server action is a POST endpoint with a
 *   public URL, so hiding the button that calls it hides nothing. The layout above
 *   these screens is chrome and says so itself, so the gate is here, per action.
 * - **Everything from the form is validated on the server.** The administrators
 *   are trusted with the archive, which is not the same as being trusted to have
 *   sent a well-formed address.
 *
 * Two decisions live in here rather than in the markup, because a screen is not a
 * boundary:
 *
 * - **A section that still holds photographs is not deleted.** `photo_category` is
 *   N:N, so deleting the section only drops the relation rows -- and a photograph
 *   left in no section is unreachable from every gallery while still being
 *   published, which is losing the archive's own organisation without a single
 *   error. Hiding does what deleting was wanted for and costs nothing.
 * - **The `slug` is set once, at creation.** It is the address of
 *   `/categoria/<slug>`, so editing it breaks every link anybody ever shared to
 *   that section. The archive's permalinks are stable by design; a section's is
 *   the same promise one level up.
 */

/** Longest we accept per kind of field. An intro can be a paragraph; a name cannot. */
const LIMITS = { name: 120, intro: 4000 }

function line(form: FormData, name: string, max: number): string | null {
  const raw = form.get(name)
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value) return null
  if (value.length > max) throw new Invalid('largo')
  return value
}

/** The section an action works on, read by slug. The form never gets to name a row id. */
async function load(slug: string) {
  const [row] = await db.select().from(category).where(eq(category.slug, slug)).limit(1)
  if (!row) throw new Invalid('seccion-no-existe')
  return row
}

/**
 * A new section, visible from the start: its public route has to appear, and the
 * page at `/categoria/<slug>` resolves through the visible list. It arrives empty,
 * which the home page shows honestly as a section with no cover and no count.
 */
export async function createCategory(form: FormData) {
  await requireAdmin()

  const result = await outcome('categories', 'seccion-creada', async () => {
    const name = line(form, 'name', LIMITS.name)
    if (!name) throw new Invalid('nombre')

    const raw = form.get('slug')
    const slug = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
    if (!isSectionSlug(slug)) throw new Invalid('direccion')

    // Checked rather than left to the unique index, so the message names the
    // mistake. Two administrators racing each other still hit the constraint,
    // which is what the constraint is for.
    const [taken] = await db
      .select({ id: category.id })
      .from(category)
      .where(eq(category.slug, slug))
      .limit(1)
    if (taken) throw new Invalid('direccion-repetida')

    await db.transaction(async (tx) => {
      const [{ next }] = await tx
        .select({ next: sql<number>`coalesce(max(${category.position}), 0) + 1` })
        .from(category)
      const [created] = await tx
        .insert(category)
        .values({ slug, position: next, visible: true })
        .returning({ id: category.id })
      await tx
        .insert(categoryTranslation)
        .values({ categoryId: created.id, locale: SOURCE_LOCALE, name })
    })
  })
  redirect(`/admin/categories?${result}`)
}

/**
 * The name, the intro and the cover. Not the slug: see the note at the top.
 *
 * The cover is checked against this section's own published photographs, because
 * those are the only ones the home page can draw -- it joins the cover on
 * `published`, and a takedown deletes the derivatives it would need.
 */
export async function saveCategory(form: FormData) {
  await requireAdmin()
  const slug = form.get('slug')
  if (!isSectionSlug(slug)) redirect('/admin/categories?error=seccion-no-existe')

  const result = await outcome('categories', 'seccion-guardada', async () => {
    const row = await load(slug)
    const name = line(form, 'name', LIMITS.name)
    if (!name) throw new Invalid('nombre')
    const intro = line(form, 'intro', LIMITS.intro)

    /**
     * **A field that did not arrive is not a field set to nothing**, and the
     * difference here is a curatorial choice surviving a takedown. The picker
     * offers the section's published photographs, so when the current cover has
     * been unpublished it is not among them -- and neither is "Ninguna" checked,
     * since a cover is set -- which leaves the radio group with nothing selected.
     * A browser submits no field at all for that, and reading the absence as "no
     * cover" cleared it on a save that never touched it: edit the intro of a
     * section whose cover is down, and the section forgets which photograph
     * represented it, permanently and without a word.
     *
     * Absent leaves the column alone. Empty is the "Ninguna" radio, and only that
     * clears it.
     */
    let coverPhotoId = row.coverPhotoId
    if (form.has('coverPhotoId')) {
      const raw = form.get('coverPhotoId')
      coverPhotoId = null
      if (typeof raw === 'string' && raw !== '') {
        if (!/^\d{1,9}$/.test(raw)) throw new Invalid('portada')
        const [found] = await db
          .select({ id: photo.id })
          .from(photoCategory)
          .innerJoin(photo, eq(photo.id, photoCategory.photoId))
          .where(
            and(
              eq(photoCategory.categoryId, row.id),
              eq(photo.id, Number(raw)),
              eq(photo.published, true),
            ),
          )
          .limit(1)
        if (!found) throw new Invalid('portada')
        coverPhotoId = found.id
      }
    }

    // Same form, same button: see the note in `admin/photos/actions.ts`.
    const translations = readTranslations(form)

    await db.transaction(async (tx) => {
      await tx.update(category).set({ coverPhotoId }).where(eq(category.id, row.id))
      await tx
        .insert(categoryTranslation)
        .values({ categoryId: row.id, locale: SOURCE_LOCALE, name, intro })
        .onConflictDoUpdate({
          target: [categoryTranslation.categoryId, categoryTranslation.locale],
          set: { name, intro },
        })
      await writeTranslations(tx, translations)
    })
  })
  redirect(`/admin/categories/${slug}?${result}`)
}

/**
 * The home page's shape: what order the sections come in and which ones are on it.
 * One form for the whole list and one statement to save it, the way the photo
 * list saves curatorial order -- moving three sections is one write.
 *
 * An unchecked checkbox sends nothing, so visibility cannot be read row by row:
 * every row submits its id in a hidden field and the checked ones submit it again
 * under `visible`, which makes the second list the set that is on.
 */
export async function saveHome(form: FormData) {
  await requireAdmin()

  const result = await outcome('categories', 'portada', async () => {
    const ids = form.getAll('id')
    const positions = form.getAll('position')
    if (ids.length === 0 || ids.length !== positions.length) throw new Invalid('orden')

    const visible = new Set(
      form.getAll('visible').filter((value): value is string => typeof value === 'string'),
    )

    const pairs = ids.map((id, index) => {
      const position = positions[index]
      if (typeof id !== 'string' || typeof position !== 'string') throw new Invalid('orden')
      if (!/^\d{1,9}$/.test(id) || !/^\d{1,6}$/.test(position)) throw new Invalid('orden')
      return sql`(${Number(id)}::int, ${Number(position)}::int, ${visible.has(id)}::boolean)`
    })

    await db.execute(sql`
      update category set position = v.position, visible = v.visible
      from (values ${sql.join(pairs, sql`, `)}) as v(id, position, visible)
      where category.id = v.id
    `)
  })
  redirect(`/admin/categories?${result}`)
}

/**
 * Deleting a section, which only happens when it is empty. See the note at the
 * top: the shortest thing that loses nothing is to refuse, and to say that hiding
 * is what refusing leaves you.
 */
export async function deleteCategory(form: FormData) {
  await requireAdmin()
  const slug = form.get('slug')
  if (!isSectionSlug(slug)) redirect('/admin/categories?error=seccion-no-existe')

  let deleted = false
  const result = await outcome('categories', 'seccion-borrada', async () => {
    const row = await load(slug)
    const [{ photos }] = await db
      .select({ photos: sql<number>`count(*)::int` })
      .from(photoCategory)
      .where(eq(photoCategory.categoryId, row.id))
    if (photos > 0) throw new Invalid('con-fotos')

    // `category_translation` cascades; `photo_category` is empty by the check above.
    await db.delete(category).where(eq(category.id, row.id))
    deleted = true
  })
  // A refusal has to land back on the section, which still exists to explain it.
  redirect(deleted ? `/admin/categories?${result}` : `/admin/categories/${slug}?${result}`)
}
