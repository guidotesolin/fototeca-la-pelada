/**
 * The site's own words, as the panel offers them. `site_text` is a key/value
 * table, and this is the list of keys that have somewhere to appear -- a
 * thirteenth key needs a component to render it, so a generic key/value editor
 * would only be a way to write text nobody ever sees.
 *
 * `kind` is both what the control looks like and how the value is validated,
 * because they are the same decision: a map embed is a `<input type="url">` here
 * and an exact-hostname check in the action, and nothing else may be either.
 */
export type Kind = 'line' | 'text' | 'email' | 'map' | 'link'

export type SiteTextField = {
  key: string
  label: string
  hint: string
  kind: Kind
  /** Where it shows up, so an editor can go and look at what they changed. */
  where: string
}

/** A caption can be a paragraph; a title cannot. Same limits as the photo screen. */
export const LIMITS: Record<Kind, number> = {
  line: 300,
  text: 4000,
  email: 300,
  map: 2000,
  link: 2000,
}

export const SITE_TEXT: SiteTextField[] = [
  {
    key: 'home_title',
    label: 'Título de la portada',
    hint: 'El título grande, arriba de todo.',
    kind: 'line',
    where: 'Portada',
  },
  {
    key: 'home_intro',
    label: 'Presentación',
    hint: 'El párrafo que dice qué es la Fototeca.',
    kind: 'text',
    where: 'Portada',
  },
  {
    key: 'town_title',
    label: 'Título sobre el pueblo',
    hint: 'El encabezado del bloque que va al lado del mapa.',
    kind: 'line',
    where: 'Portada',
  },
  {
    key: 'town_intro',
    label: 'Texto sobre el pueblo',
    hint: 'Dejá un renglón en blanco entre párrafo y párrafo.',
    kind: 'text',
    where: 'Portada',
  },
  {
    key: 'map_embed_url',
    label: 'Mapa',
    hint: 'La dirección del mapa de Google que se ve en la portada. Se saca con "Compartir → Insertar un mapa" y empieza con https://www.google.com/maps/embed o https://maps.google.com.',
    kind: 'map',
    where: 'Portada',
  },
  {
    key: 'thanks',
    label: 'Agradecimiento',
    hint: 'La frase grande del pie de página.',
    kind: 'text',
    where: 'Pie de página',
  },
  {
    key: 'rights_notice',
    label: 'Aviso de derechos',
    hint: 'La letra chica sobre el permiso de los dueños de las fotografías.',
    kind: 'text',
    where: 'Pie de página',
  },
  {
    key: 'authors',
    label: 'A cargo del archivo',
    hint: 'Quiénes lo mantienen.',
    kind: 'line',
    where: 'Pie de página',
  },
  {
    key: 'contact',
    label: 'Contacto',
    hint: 'La dirección de correo a la que se escribe para una corrección o una baja.',
    kind: 'email',
    where: 'Pie de página',
  },
  {
    key: 'facebook_url',
    label: 'Facebook',
    hint: 'Dejalo vacío para que no aparezca.',
    kind: 'link',
    where: 'Pie de página',
  },
  {
    key: 'instagram_url',
    label: 'Instagram',
    hint: 'Dejalo vacío para que no aparezca.',
    kind: 'link',
    where: 'Pie de página',
  },
  {
    key: 'youtube_url',
    label: 'YouTube',
    hint: 'Dejalo vacío para que no aparezca.',
    kind: 'link',
    where: 'Pie de página',
  },
]

/**
 * The address they write to. It is interpolated into a `mailto:`, which cannot
 * execute, so this is about a typo reaching the footer rather than about a
 * scheme -- one `@`, a dot after it, no spaces.
 */
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
