/**
 * Smoke test for `toSectionSlug` in `src/lib/slug.ts`, the suggestion the panel
 * writes into the Dirección box while somebody types a section's name.
 *
 * The cases that matter are the ones a Spanish name brings: an accent that must
 * leave its letter behind, an `ñ`, a degree sign in «Escuela N° 253», and a name
 * long enough that the cut lands on a hyphen. The last check is the one that keeps
 * the two functions in this file honest with each other -- what the suggestion
 * writes, the server's `isSectionSlug` has to accept, or the panel is offering
 * addresses it will then refuse.
 *
 * No network and no database: both functions are pure.
 *
 *   npm run slug:smoke
 */
import assert from 'node:assert/strict'
import { isSectionSlug, toSectionSlug } from '../src/lib/slug'

const CASES: [string, string][] = [
  ['NuEva SecciÓn', 'nueva-seccion'],
  ['Fiestas Patronales 2019', 'fiestas-patronales-2019'],
  // The letter survives the accent: `seccin` is what deleting non-ASCII gives.
  ['Sección', 'seccion'],
  ['Río Salado', 'rio-salado'],
  ['Cañada', 'canada'],
  ['Ñandú', 'nandu'],
  ['Inundación del 78', 'inundacion-del-78'],
  ['Escuela N° 253', 'escuela-n-253'],
  // Runs collapse to one hyphen, which is the shape `SECTION_SLUG` allows.
  ['La  Pelada -- vieja', 'la-pelada-vieja'],
  ['  espacios  ', 'espacios'],
  ['ESPACIOS', 'espacios'],
  ['sociales', 'sociales'],
  // Nothing usable in it. The box stays empty and `required` is what says so.
  ['¿¡', ''],
  ['', ''],
  ['2019', '2019'],
  // 59 is the cap. Cut first, trim after: the cut lands on the hyphen before
  // `bbb`, and a slug ending in one is not a slug.
  [`${'a'.repeat(58)} bbb`, 'a'.repeat(58)],
  [`${'a'.repeat(70)} bbb`, 'a'.repeat(59)],
]

let checks = 0

for (const [name, expected] of CASES) {
  const got = toSectionSlug(name)
  assert.equal(got, expected, `toSectionSlug(${JSON.stringify(name)}) gave ${JSON.stringify(got)}`)
  checks++

  // Empty is the one thing it may produce that the server will not take, and the
  // form cannot submit it: the field is `required`.
  assert.equal(
    got === '' || isSectionSlug(got),
    true,
    `isSectionSlug rejected its own suggestion ${JSON.stringify(got)}`,
  )
  checks++
}

console.log(`toSectionSlug: ${CASES.length} cases pass`)
console.log(`\n${checks} checks pass`)
