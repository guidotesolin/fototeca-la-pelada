'use client'

import { useSyncExternalStore } from 'react'

const KEY = 'sensitive'
const CLASS = 'show-sensitive'

/**
 * The archive-wide answer to the veil, from the header's settings panel.
 *
 * It is a class on the root and a line in `localStorage`, not a cookie: a cookie
 * would have to be read in the layout, and reading one makes every one of the
 * prerendered routes dynamic -- the whole archive rendered per request so that one
 * reader can see a blur come off. The class is put there before paint by the inline
 * script in `(public)/layout.tsx`; the rules it drives are in globals.css.
 *
 * So the state does not live in React, it lives on `<html>`, and this reads it with
 * `useSyncExternalStore` rather than mirroring it into a `useState` from an effect.
 * The server snapshot is `false` because the server cannot know: the switch paints
 * off for one frame on a page where the preference is on. The photographs do not,
 * which is the part that matters.
 *
 * With JavaScript off the switch does nothing and the veil stays. The failure that
 * leaves a sensitive photograph covered is the right one.
 *
 * Its one string arrives as a prop, translated on the server. A client component
 * that read the message files itself would ship them to the browser -- four
 * languages of copy, paid for with rural mobile data, for one `aria-label`.
 */
const listeners = new Set<() => void>()

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  return () => void listeners.delete(onChange)
}

export function SensitiveSwitch({ label }: { label: string }) {
  const shown = useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains(CLASS),
    () => false,
  )

  return (
    <button
      type="button"
      role="switch"
      aria-checked={shown}
      aria-label={label}
      className="switch focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2"
      onClick={() => {
        const next = !shown
        document.documentElement.classList.toggle(CLASS, next)
        /**
         * Asking for the veil back has to mean every photograph, including one a
         * photo page had already uncovered on its own. Its `<details class="reveal">`
         * keeps `[open]` otherwise, and `.reveal[open] ~ figure img { filter: none }`
         * would go on beating the blur -- so the reader would ask to be covered and
         * the slaughter would stay on screen. Worse while the preference was on,
         * because this panel hides that card's label and the press that latched it
         * showed nothing at all.
         */
        if (!next) {
          for (const card of document.querySelectorAll<HTMLDetailsElement>('details.reveal[open]'))
            card.open = false
        }
        try {
          if (next) localStorage.setItem(KEY, '1')
          else localStorage.removeItem(KEY)
        } catch {
          // A private window refuses to store it. The class is set either way, so
          // the choice holds for this visit and is simply not remembered.
        }
        for (const notify of listeners) notify()
      }}
    />
  )
}
