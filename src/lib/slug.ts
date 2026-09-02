/**
 * The shape a section's address may take, in one place because it is checked in
 * several: the panel validates it before creating a section, both public gallery
 * routes check it before rendering an unknown one, and the Drive import builds a
 * photograph's identifier out of it.
 *
 * Lowercase, digits and single inner hyphens. The photograph slugs in
 * `admin/photos/actions.ts` are deliberately a different, looser shape -- they
 * were minted by the seed and are not ours to tighten retroactively.
 */
const SECTION_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

/**
 * **Shorter than the 64 `category.slug` holds, and the five characters are the
 * Drive import's.** A photograph imported into a section is `<section>-NNN`, and
 * `photo.slug` is `varchar(64)` too -- so a section allowed to use all 64 could
 * be created happily and then refuse every photograph for ever, with Postgres
 * rejecting the insert and the panel able to say only "probá de nuevo". Capping
 * the section instead means the state cannot exist: 59 leaves room for `-9999`,
 * ten times more photographs than the largest section holds. The longest slug in
 * the archive is `inundacion-78`, at 13.
 */
const MAX_SECTION_SLUG = 59

export function isSectionSlug(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_SECTION_SLUG && SECTION_SLUG.test(value)
}
