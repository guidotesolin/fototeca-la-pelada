'use client'

import { useState } from 'react'
import { toSectionSlug } from '@/lib/slug'
import { FIELD, Field } from '../ui'

/**
 * The two boxes that make a section, with the address writing itself out of the
 * name: `toSectionSlug` runs on every keystroke, so "NuEva SecciÓn" is
 * `nueva-seccion` by the time the name is finished.
 *
 * **The suggestion steps aside the moment the address is typed in.** The slug is
 * the one field on this screen that can never be corrected afterwards -- it is the
 * public address of `/categoria/<slug>` -- so somebody who wants `fiestas` for a
 * section called «Fiestas patronales de San Roque» has to be able to hold it, and
 * a name typed after that must not quietly take it back. Emptying the box hands it
 * back: there is nothing being held any more.
 *
 * Nothing here is a check. `createCategory` validates the address it receives with
 * the same `isSectionSlug` it always did and takes it exactly as sent, which is
 * also what makes this screen work with script off: no suggestion arrives, the two
 * boxes are filled by hand, and the `pattern` on the address is the browser's.
 */
export function NewSection() {
  const [slug, setSlug] = useState('')
  /** Whether the address is being held by hand rather than suggested. */
  const [own, setOwn] = useState(false)

  return (
    <>
      <Field label="Nombre" hint="Como se lee en la portada y en el menú.">
        <input
          type="text"
          name="name"
          required
          maxLength={120}
          onChange={(event) => !own && setSlug(toSectionSlug(event.target.value))}
          className={FIELD}
        />
      </Field>
      <Field
        label="Dirección"
        hint="Se completa sola con el nombre, sin acentos ni mayúsculas. Si la escribís, queda la tuya. No se puede cambiar después, porque es el enlace que la gente comparte."
      >
        <input
          type="text"
          name="slug"
          required
          maxLength={64}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          placeholder="fiestas-patronales"
          value={slug}
          onChange={(event) => {
            setSlug(event.target.value)
            setOwn(event.target.value !== '')
          }}
          className={FIELD}
        />
      </Field>
    </>
  )
}
