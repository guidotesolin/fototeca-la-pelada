import 'server-only'
import { and, eq, gt, inArray, sql } from 'drizzle-orm'
import { db } from '@/db'
import { category, photoCategory } from '@/db/schema'
import { Invalid } from '../invalid'

/**
 * Which sections a photograph belongs to, written as the difference between what
 * it is in and what the form ticked. It is not the only writer of
 * `photo_category` -- the Drive import inserts the first row of a photograph it
 * creates, `saveOrder` rewrites positions, and both foreign keys cascade -- but it
 * is the only one that takes rows away from a photograph that stays.
 *
 * **In a file of its own rather than inside the action, for the reason
 * `translations/save.ts` is**: an action is `'use server'` and drags in
 * `next/navigation` and Auth.js, so nothing outside Next can call it. This is the
 * riskiest write on the photograph's screen -- three refusals and an arithmetic
 * that is invisible when it is wrong -- and `npm run db:smoke` asserts every one
 * of them against a real database from a plain Node process.
 *
 * It takes the caller's transaction, so the whole change is one commit: a
 * photograph that leaves Deporte and does not arrive in Sociales is exactly the
 * half-applied state the refusals exist to prevent.
 */

/** Both `db` and a transaction satisfy this, without naming Drizzle's internals. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function writeSections(tx: Tx, photoId: number, wanted: string[]): Promise<void> {
  /**
   * **Nothing ticked is refused and never obeyed.** A photograph in no section is
   * still published and still indexed, and it is reachable from no gallery -- the
   * loss T11 already declines to take when it refuses to delete a section that
   * still holds photographs.
   *
   * It counts sections and not *visible* sections, which is deliberate: T11 hides
   * a section rather than delete it exactly so its photographs are kept, so a
   * photograph living only in a hidden one is a state the panel sanctions
   * elsewhere and must not refuse here. What the screen owes instead is to say
   * which sections those are, and it does.
   */
  if (wanted.length === 0) throw new Invalid('sin-seccion')

  // Resolved against the table and never trusted, the way every other write in
  // the panel names a row: the form carries slugs, and one of them could have
  // been deleted between the render and the submit. Deduplicated first, so a
  // value repeated in the post is neither a mismatch nor a longer `in` list than
  // there are sections.
  const asked = [...new Set(wanted)]
  const chosen = await tx
    .select({ id: category.id })
    .from(category)
    .where(inArray(category.slug, asked))
  if (chosen.length !== asked.length) throw new Invalid('seccion-no-existe')

  const current = await tx
    .select({
      id: photoCategory.categoryId,
      position: photoCategory.position,
      cover: category.coverPhotoId,
    })
    .from(photoCategory)
    .innerJoin(category, eq(category.id, photoCategory.categoryId))
    .where(eq(photoCategory.photoId, photoId))

  const keep = new Set(chosen.map((c) => c.id))
  const remove = current.filter((c) => !keep.has(c.id))
  const add = chosen.filter((c) => !current.some((have) => have.id === c.id))

  /**
   * **A section's cover may not be taken out of that section**, and the check is
   * here, before the first write, so a save that touches two sections cannot
   * half-apply. `cover_photo_id` would go on naming a photograph that no longer
   * belongs to the section, and the home page would draw a card whose picture is
   * not in what it opens. Clearing the cover instead was the other candidate and
   * it is worse: the section silently loses its picture and nobody is told.
   */
  if (remove.some((c) => c.cover === photoId)) throw new Invalid('portada-en-uso')

  for (const section of remove) {
    await tx
      .delete(photoCategory)
      .where(and(eq(photoCategory.photoId, photoId), eq(photoCategory.categoryId, section.id)))
    /**
     * The hole it left, closed. The reorder screen prints the raw number in a box,
     * so a gap in the middle is a column of numbers that stops saying what it
     * means, and the next photograph out leaves another.
     *
     * Every section is dense 1..N **today**, which is a fact about the archive and
     * not an invariant -- `saveOrder` accepts any number in the box, repeats
     * included. This does not depend on it: subtracting one from everything
     * strictly above the departure preserves the order of whatever numbering it
     * finds, and dense is what it keeps when dense is what it was given.
     */
    await tx
      .update(photoCategory)
      .set({ position: sql`${photoCategory.position} - 1` })
      .where(
        and(eq(photoCategory.categoryId, section.id), gt(photoCategory.position, section.position)),
      )
  }

  for (const section of add) {
    // Last in the section, which is where the Drive import already puts a
    // photograph that arrives today: the curatorial order is theirs to give.
    const [{ position }] = await tx
      .select({ position: sql<number>`coalesce(max(${photoCategory.position}), 0) + 1` })
      .from(photoCategory)
      .where(eq(photoCategory.categoryId, section.id))
    await tx.insert(photoCategory).values({ photoId, categoryId: section.id, position })
  }
}
