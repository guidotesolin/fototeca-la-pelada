/**
 * The words a translation may not touch, and the check that says when one went
 * missing.
 *
 * **This is a matter of archival criteria, not of code**, so the reasoning, the
 * per-language glosses and the procedure for adding a fifth language live in
 * `docs/TRANSLATION.md`. That document points here rather than repeating the
 * list: two copies of one fact is how one of them goes stale, and this is the
 * copy a machine can read.
 *
 * Why it exists at all: the archive is going to be translated with machine help
 * and human review, and the failure that costs the most is the one that looks
 * fluent. **"María Luisa" is a locality in this archive** and a translator that
 * reads it as a woman's name breaks the way people search for their own town.
 * Street names are the same argument -- "calle 20 de agosto" is what somebody
 * types, so translating it makes the photograph unfindable by the person most
 * likely to want it.
 */

/**
 * Grouped, because the group is the reason. A term is on this list because of
 * the class it belongs to, and a fifth language inherits the classes rather than
 * re-deciding them one word at a time.
 *
 * It is **not exhaustive and does not need to be**: it is a net for the mistakes
 * that are expensive, drawn from the archive's own captions. Adding a term is
 * one line here and one line in the document.
 */
export const PROTECTED: Record<string, readonly string[]> = {
  /** Surnames. The archive is mostly Piedmontese and Spanish families. */
  surnames: [
    'Chiaraviglio',
    'Peretti',
    'Dándolo',
    'Ravasio',
    'Zunino',
    'Marengo',
    'Tesolín',
    'Bonetto',
    'Lezcano',
    'Capellino',
    'Ludueña',
    'Lazzaroni',
    'Troncoso',
    'Bauducco',
    'Barbiero',
    'Sanmartino',
    'Szeretter',
    'Alassia',
    'Mayoraz',
    'Iturraspe',
  ],

  /**
   * Nicknames, which in this town are how people are actually known. They are
   * written inside quotation marks in the captions and the marks are part of
   * them: «"Cachi" Dándolo» is a name, not a description.
   */
  nicknames: ['Cachi', 'Falucho', 'Boteron', 'Uchi', 'Naranjina'],

  /**
   * Streets, routes and roads. The reason is the sharpest one on this page: this
   * is the string somebody types into the search box, and a translated street
   * name is a photograph nobody finds.
   */
  streets: [
    'San Martín',
    'San Bernardo',
    'Malvinas Argentinas',
    '20 de agosto',
    'Camino Real',
    'Ruta 69S',
  ],

  /**
   * Places. **"María Luisa" is a locality here**, and this is the entry that
   * exists because the archive was already misread once.
   */
  places: [
    'La Pelada',
    'María Luisa',
    'Santa Fe',
    'Las Colonias',
    'Progreso',
    'Soledad',
    'Ataliva',
    'San Justo',
    'Eucaliptus',
  ],

  /** Estancias, businesses and institutions, which are proper names too. */
  institutions: [
    'La Esmeralda',
    'El Martillo',
    'El Cometa',
    'La Gerda',
    'La Casualidad',
    'Independiente',
    'Libertad',
    'Florián Paucke',
    'Mariano Moreno',
    'Santa Ana',
  ],

  /**
   * Local terms, which are the one class that is **not** a proper name. They
   * stay in Spanish and carry a short gloss the first time -- `carneada (a rural
   * animal-butchering gathering)`, which is what ARCHITECTURE.md itself already
   * does. The word survives because it is the word, and the gloss is what makes
   * the caption readable to a descendant who does not speak Spanish.
   *
   * **The test is whether the other language has a word that carries the thing**,
   * and not how local the term feels or how rarely it appears. `guardapolvo` is
   * not a smock, `tenis criollo` is not tennis, and `yerra` is the gathering
   * rather than the branding -- so those stay. `fortines` and `trilla` were on this
   * list and came off it: forts are forts and threshing is threshing, and nothing
   * is lost. `docs/TRANSLATION.md` records both decisions and the criterion.
   */
  local: [
    'carneada',
    'parva',
    'parvero',
    'yerra',
    'tapera',
    'quebrachal',
    'picadito',
    'guardapolvo',
    'ramos generales',
    'tenis criollo',
    'FONAVI',
  ],
}

/** The same list, flat, which is what the check walks. */
export const PROTECTED_TERMS: readonly string[] = Object.values(PROTECTED).flat()

/**
 * Accent- and case-insensitive, so that a translator writing "Tesolin" for
 * "Tesolín" is not reported. Same NFD fold as `toSectionSlug` in `lib/slug.ts`:
 * the marks come off and the letter under them survives.
 */
function fold(value: string): string {
  return (
    value
      .normalize('NFD')
      // The combining marks NFD just split off, written as escapes rather than
      // as the characters themselves: they are invisible in an editor, and a
      // range nobody can see is a range nobody can check. Not `\p{Diacritic}`,
      // which is a Unicode property escape and this project targets ES2017.
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
  )
}

/**
 * The protected terms that are in the Spanish source and **not** in the
 * translation.
 *
 * Plain substring matching, deliberately. `\b` in JavaScript is defined over
 * `[A-Za-z0-9_]`, so `\bTesolín\b` has no boundary after the `í` and silently
 * never matches -- a check that fails open is worse than no check. The terms
 * here are distinctive enough that a substring is not a source of noise, and
 * this is an advisory warning next to a field rather than a gate: it says "look
 * at this", and a person decides.
 *
 * An empty translation returns nothing: not translated yet is not a mistake, and
 * the screen already says so in its own way.
 */
export function missingTerms(source: string, translation: string): string[] {
  if (!translation.trim()) return []
  const from = fold(source)
  const to = fold(translation)
  return PROTECTED_TERMS.filter((term) => {
    const folded = fold(term)
    return from.includes(folded) && !to.includes(folded)
  })
}
