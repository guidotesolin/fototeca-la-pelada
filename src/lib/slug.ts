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

/**
 * A name turned into an address to *suggest*, which is the panel's Dirección box
 * filling itself in while somebody types the Nombre: "NuEva SecciÓn" arrives as
 * `nueva-seccion`.
 *
 * **The accents are folded, not deleted.** NFD splits `ó` into a plain `o` and a
 * combining acute, and only the combining marks are removed -- so the letter under
 * the accent survives and `sección` comes out `seccion` and not `seccin`, which is
 * what stripping "the non-ASCII characters" would have done. `ñ` decomposes the
 * same way and lands on `n`: `cañada` is `canada`, which is what a Spanish web
 * address is expected to look like, and the alternative is an address nobody can
 * type. Everything else that is not a letter or a digit becomes a hyphen, and the
 * run collapses -- «Fiestas Patronales 2019» is `fiestas-patronales-2019`.
 *
 * It cuts to the same length `isSectionSlug` accepts, and trims after cutting so
 * a truncated word cannot leave a hyphen hanging at the end.
 *
 * **It suggests and never decides.** The server takes the field exactly as sent
 * and checks it with `isSectionSlug`: a slug is the permanent public address of
 * `/categoria/<slug>`, so it has to be what the person left in the box, not what
 * this would have written for them.
 */
export function toSectionSlug(name: string): string {
  return (
    name
      .normalize('NFD')
      // The combining marks NFD just split off. Not `\p{Diacritic}`, which is a
      // Unicode property escape and this project targets ES2017.
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, MAX_SECTION_SLUG)
      .replace(/^-+|-+$/g, '')
  )
}
