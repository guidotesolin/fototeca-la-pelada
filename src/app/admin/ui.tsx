import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * The panel's shared parts: the two class strings every control uses, the field
 * wrappers, and what a write reports back.
 *
 * It exists because T11 added three screens to T10's two and every one of them
 * draws the same form. The alternative was five copies of `FIELD`, of the
 * checkbox layout and of the outcome banner, which is the sort of thing that
 * drifts one screen at a time until the panel looks assembled from parts.
 *
 * Spanish, and never translated: only the two of them use it, so there is no
 * i18n machinery here -- `next-intl` wraps the public routes only.
 */

export const FIELD =
  'bg-surface border-rule text-text focus-visible:outline-focus w-full border px-3 py-2 font-sans text-[15px] focus-visible:outline-2 focus-visible:outline-offset-1'

export const BUTTON =
  'border-rule bg-surface hover:border-accent focus-visible:outline-focus t-label inline-flex h-10 cursor-pointer items-center justify-center border px-4 focus-visible:outline-2 focus-visible:outline-offset-2'

/**
 * For a row where controls sit side by side and their heights show: each one
 * sizes from its own font otherwise -- selects at 39px, a search box at 40, a
 * button at 33 -- so the row gets one height and they all take it.
 */
export const CONTROL = `${FIELD} h-10`

/** A repeated search param is an array; most of the panel reads none of them that way. */
export function one(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : ''
}

/**
 * The one that is repeated on purpose: `?files=…&files=…` is how the import screen
 * carries a selection across the redirect between one photograph and the next. A
 * single value arrives as a string and has to be read as a list of one.
 */
export function many(value: string | string[] | undefined): string[] {
  return typeof value === 'string' ? [value] : (value ?? [])
}

/**
 * What a write can report back, as codes rather than as prose in the address bar.
 *
 * The wording is the archive's, not the storage's: two history teachers use this
 * screen, and "derivadas", "R2" and "410" name things they have no reason to have
 * heard of. What they need to know is whether the photograph is on the site and
 * whether anything was lost.
 *
 * The panel's actions redirect to `?ok=` or `?error=`, which is what makes them
 * work with JavaScript off -- a form post answers 303 and the next page renders
 * the outcome. Codes, because anything reflected out of a query string is text an
 * administrator would read as ours; the sign-in screen keeps its messages the
 * same way.
 */
export const DONE: Record<string, string> = {
  guardado: 'Cambios guardados.',
  publicado: 'Se publicó: ya está en el sitio.',
  despublicado: 'Se despublicó: salió del sitio. La imagen queda guardada.',
  restaurada: 'Se adjuntó la versión restaurada.',
  'restauracion-quitada': 'Se quitó la versión restaurada.',
  orden: 'Se guardó el orden de la sección.',
  portada: 'Se guardó el orden y qué secciones se ven.',
  'seccion-creada': 'Se creó la sección. Ya tiene su página en el sitio.',
  'seccion-guardada': 'Se guardó la sección.',
  'seccion-borrada': 'Se borró la sección.',
  textos: 'Se guardaron los textos del sitio.',
  traducciones: 'Se guardaron las traducciones. Ya están en el sitio.',
  importada: 'Se importó una fotografía desde Drive y ya está en el sitio.',

  // --- videoteca ---
  'video-creado': 'Se agregó la entrevista a la Videoteca y ya está en el sitio.',
  'video-guardado': 'Se guardó la entrevista.',
  'video-publicado': 'Se publicó la entrevista: ya está en la Videoteca.',
  'video-despublicado':
    'Se despublicó la entrevista: salió de la Videoteca y su página responde que fue retirada. El video sigue en YouTube.',
}

export const FAILED: Record<string, string> = {
  'no-existe': 'Esa fotografía no está en el archivo.',
  anios:
    'Los años no son válidos: revisá que sean números y que el desde no sea posterior al hasta.',
  largo: 'Alguno de los textos supera el largo permitido.',
  archivo: 'El archivo no es una imagen que podamos procesar, o pesa más de 3,5 MB.',
  'sin-archivo': 'Elegí un archivo antes de adjuntarlo.',
  'carpeta-restauradas':
    'No encontramos la carpeta «Restauradas» dentro de la carpeta de originales de Drive. Revisá que exista y que se llame así.',
  'fuera-de-carpeta':
    'Ese archivo ya no está en la carpeta «Restauradas» de Drive. Recargá la pantalla para ver qué hay ahora.',
  // The one case where the panel cannot do the job by itself, and it says why in
  // terms of the archive rather than of the storage underneath it. It stopped
  // being reachable for a photograph imported from Drive when T12 made reading
  // the master polymorphic; what is left is a row with no master anywhere.
  'sin-master':
    'No se puede publicar: no encontramos la copia original de esta fotografía, ni en el archivo ni en Drive.',
  orden: 'El orden recibido no es válido.',

  // --- sections ---
  'seccion-no-existe': 'Esa sección no existe.',
  nombre: 'Escribí un nombre para la sección.',
  direccion:
    'La dirección de la sección sólo puede llevar minúsculas, números y guiones, y como mucho 59 caracteres: por ejemplo, fiestas-patronales.',
  'direccion-repetida': 'Ya hay una sección con esa dirección.',
  // Deliberately not a bulk reassignment flow: hiding does the job without
  // risking a photograph that ends up in no section and therefore in no gallery.
  'con-fotos':
    'Esa sección todavía tiene fotografías, así que no se puede borrar. Ocultala: sale del menú y de la portada, y no se pierde ninguna.',
  portada:
    'Esa fotografía no sirve como portada: tiene que estar en esta sección y estar publicada.',

  // --- translations ---
  // Anything the queue or a translation box sends that is not one of the three
  // languages the editor writes. Spanish included: it is the source language and
  // it is edited on the screens that own it, never through a translation form.
  idioma: 'Ese idioma no se edita desde acá.',

  // --- videoteca ---
  'video-no-existe': 'Esa entrevista no está en la Videoteca.',
  // Deliberately not "el ID no es válido": what an administrator has in the
  // clipboard is the whole address, so the message says which part of it to keep.
  'id-youtube':
    'Ese no es un ID de YouTube. Es la parte que va después de «v=» en la dirección del video, y son 11 caracteres: por ejemplo, en youtube.com/watch?v=yJ4sZrsuzyw el ID es yJ4sZrsuzyw.',
  'id-repetido': 'Esa entrevista ya está en la Videoteca.',
  poster:
    'No pudimos traer la miniatura del video desde YouTube. Revisá que el ID sea correcto y que el video sea público, y probá de nuevo.',
  titulo: 'Escribí un título para la entrevista.',

  // --- site text ---
  'url-red': 'Ese enlace de red social no es válido: tiene que empezar con https://',
  email: 'Esa dirección de correo no es válida.',

  // --- Drive import ---
  carpeta: 'Esa carpeta no es la carpeta de originales de Drive ni una de las que tiene adentro.',
  'nada-pendiente': 'No quedaba ninguna fotografía por importar en esa carpeta.',
  'nada-elegido': 'No había ninguna elegida. Tocá las que quieras importar y probá de nuevo.',
  // Both name the *first pending* file, because that is the one the import
  // always takes next: nothing skips past it, so the folder has to be fixed.
  // The screen's list is anchored on that same file, so it is on screen.
  imagen:
    'La primera fotografía por importar de esa carpeta no es una imagen que podamos procesar. Sacala de la carpeta en Drive, o arreglala, para poder seguir con el resto.',
  'archivo-grande':
    'La primera fotografía por importar de esa carpeta pasa los 40 MB. Sacala de la carpeta en Drive para poder seguir con el resto.',

  // F31's rate limit, from `write.ts`. Only the Drive import can get near it, so
  // the wording points at waiting rather than at anything being wrong.
  'demasiado-rapido':
    'Demasiados cambios seguidos. Esperá un minuto y seguí: no se perdió nada de lo anterior.',

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

/**
 * The way out of a screen, above its title. Every screen under `/admin` has one
 * and five of the seven are the same link back to the panel's home, so the
 * defaults are that link and the exceptions say where they go instead: a
 * photograph goes back to the list it was in, a section to the list it is ordered
 * in.
 *
 * Here rather than copied per screen for the reason at the top of this file: it is
 * the sort of thing that drifts one screen at a time, and a back link that reads
 * differently on each of them is a panel that feels assembled from parts.
 */
export function Back({ href = '/admin', label = 'Panel' }: { href?: string; label?: string }) {
  return (
    <Link
      href={href}
      className="t-credit link text-muted hover:text-text focus-visible:outline-focus inline-block py-1.5 focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      ← {label}
    </Link>
  )
}

/**
 * The outcome of the last write, in two shapes for two different things: a save
 * announces itself over the screen and leaves after five seconds, a failure stays
 * in the flow until it is dealt with.
 *
 * The disappearing is a CSS animation and not a timer, so it works with
 * JavaScript off like the rest of the panel; `prefers-reduced-motion` drops the
 * movement and keeps it.
 */
export function Notice({ params }: { params: Record<string, string | string[] | undefined> }) {
  const failure = messageFor(FAILED, one(params.error))
  const message = failure ?? messageFor(DONE, one(params.ok))
  if (!message) return null

  return failure ? (
    <p role="alert" className="bg-surface border-accent t-credit mt-6 border p-4">
      {message}
    </p>
  ) : (
    <p
      role="status"
      className="snackbar bg-surface border-rule t-credit fixed inset-x-4 bottom-6 z-50 mx-auto w-fit max-w-lg border px-5 py-3"
    >
      {message}
    </p>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="t-label block pb-1.5">{label}</span>
      {children}
      {hint && <span className="t-meta mt-1 block">{hint}</span>}
    </label>
  )
}

export function Check({
  name,
  label,
  hint,
  value,
  defaultChecked,
}: {
  name: string
  label: string
  hint: string
  /** Set it to carry an id: an unchecked box sends nothing, so a bulk form reads the checked set. */
  value?: string
  defaultChecked: boolean
}) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="accent-accent focus-visible:outline-focus mt-1 h-4 w-4 focus-visible:outline-2 focus-visible:outline-offset-2"
      />
      <span>
        <span className="t-label block">{label}</span>
        <span className="t-meta mt-0.5 block">{hint}</span>
      </span>
    </label>
  )
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-rule flex flex-col gap-1 border-b py-3 sm:flex-row sm:gap-8">
      <dt className="t-label sm:w-36 sm:shrink-0 sm:pt-1">{label}</dt>
      <dd className="t-meta">{children}</dd>
    </div>
  )
}
