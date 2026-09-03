'use client'

import { useEffect, useRef, useState } from 'react'
import { Submit } from '../submit'
import { BUTTON } from '../ui'

/**
 * The two buttons over the folder's list, and the only thing on this screen that
 * knows how many files are ticked *right now*.
 *
 * The boxes themselves stay where they were: server-rendered, uncontrolled, one
 * per row. Lifting the whole list into client state would have sent the
 * thumbnails, the names and the links to the browser to learn one number, so this
 * reads the number off the form instead -- one delegated `change` listener, and
 * `initial` is the same count worked out on the server, so the button is already
 * right in the HTML before any script runs.
 *
 * **"Elegir todas" ticks; it does not import.** It used to import the folder
 * outright, and this is the same button with the confirmation put back: you see
 * the scans you are about to bring in, on screen, before pressing the one button
 * that writes anything. It toggles, because a screen that can tick seventy boxes
 * and not untick them is a screen you reload to get out of.
 *
 * With script off nothing here moves, and nothing here is a check: the boxes tick
 * by hand, the import button is never disabled, and pressing it with none ticked
 * gets `nada-elegido` back from the action -- which is the real refusal either
 * way, since a disabled button is not one.
 */

/** Every box the form carries, the ones parked outside the window included. */
const BOX = 'input[type="checkbox"][name="files"]'

export function Pick({
  /** How many boxes there are, so "todas" knows when it has them all. */
  total,
  /** How many arrived ticked, from `?files=…`. */
  initial,
}: {
  total: number
  initial: number
}) {
  const anchor = useRef<HTMLDivElement>(null)
  const [chosen, setChosen] = useState(initial)

  useEffect(() => {
    // The rows are not this component's children, so the listener goes on the
    // form: one of them, whatever the window happens to be showing.
    const form = anchor.current?.closest('form')
    if (!form) return
    const recount = () => setChosen(form.querySelectorAll(`${BOX}:checked`).length)
    form.addEventListener('change', recount)
    return () => form.removeEventListener('change', recount)
  }, [])

  const all = total > 0 && chosen === total

  return (
    <div ref={anchor} className="mt-5 flex flex-wrap items-center gap-3">
      <Submit disabled={chosen === 0} busy="Importando…">
        Importar las elegidas
        {chosen > 0 && ` (${chosen})`}
      </Submit>

      <button
        type="button"
        onClick={() => {
          const form = anchor.current?.closest('form')
          if (!form) return
          for (const box of form.querySelectorAll<HTMLInputElement>(BOX)) box.checked = !all
          setChosen(all ? 0 : total)
        }}
        className={BUTTON}
      >
        {all ? 'No elegir ninguna' : 'Elegir todas'}
      </button>
    </div>
  )
}
