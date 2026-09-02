/**
 * The shape a section's address may take, in one place because it is checked in
 * three: the panel validates it before creating a section, and both public
 * gallery routes check it before rendering an unknown one.
 *
 * Lowercase, digits and single inner hyphens, and it must fit `category.slug`,
 * which the schema caps at 64. The photograph slugs in `admin/photos/actions.ts`
 * are deliberately a different, looser shape -- they were minted by the seed and
 * are not ours to tighten retroactively.
 */
const SECTION_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function isSectionSlug(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && SECTION_SLUG.test(value)
}
