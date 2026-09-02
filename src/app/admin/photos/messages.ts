/**
 * What a write can report back, as codes rather than as prose in the address bar.
 *
 * The wording is the archive's, not the storage's: two history teachers use this
 * screen, and "derivadas", "R2" and "410" name things they have no reason to have
 * heard of. What they need to know is whether the photograph is on the site and
 * whether anything was lost.
 * The panel's actions redirect to `?ok=` or `?error=`, which is what makes them
 * work with JavaScript off -- a form post answers 303 and the next page renders
 * the outcome. Codes, because anything reflected out of a query string is text an
 * administrator would read as ours; the sign-in screen keeps its messages the
 * same way.
 */

export const DONE: Record<string, string> = {
  guardado: 'Cambios guardados.',
  publicado: 'Se publicó: ya está en el sitio.',
  despublicado: 'Se despublicó: salió del sitio y su imagen ya no está disponible.',
  restaurada: 'Se adjuntó la versión restaurada.',
  'restauracion-quitada': 'Se quitó la versión restaurada.',
  orden: 'Se guardó el orden de la sección.',
}

export const FAILED: Record<string, string> = {
  'no-existe': 'Esa fotografía no está en el archivo.',
  anios:
    'Los años no son válidos: revisá que sean números y que el desde no sea posterior al hasta.',
  largo: 'Alguno de los textos supera el largo permitido.',
  archivo: 'El archivo no es una imagen que podamos procesar, o pesa más de 3,5 MB.',
  'sin-archivo': 'Elegí un archivo antes de adjuntarlo.',
  // The one case where the panel cannot do the job by itself, and it says why in
  // terms of the archive rather than of the storage underneath it.
  'sin-master':
    'No se puede publicar: falta la copia original de esta fotografía en el archivo. Va a poder hacerse cuando esté la importación desde Drive.',
  orden: 'El orden recibido no es válido.',
  interno: 'No se pudo completar la operación. Probá de nuevo.',
}

/**
 * Own properties only. `DONE['__proto__']` is `Object.prototype` and
 * `DONE['toString']` is a function -- both truthy, both handed to React as a
 * child, which throws. The code comes from the address bar, so it is not ours.
 */
export function messageFor(map: Record<string, string>, code: string): string | null {
  return Object.hasOwn(map, code) ? map[code] : null
}
