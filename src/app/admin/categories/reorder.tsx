'use client'

import { useState, type ReactNode } from 'react'

/**
 * The order of the sections on the home page, moved rather than numbered.
 *
 * It replaces a box per row holding a position. The numbers were a translation
 * step: you had the order you wanted and had to work out which three numbers
 * produce it, with nothing on screen agreeing with you until after the save. Here
 * the list *is* the order -- `position` is the row's place in it, submitted hidden
 * -- so `saveHome` is untouched and moving three sections is still one write.
 *
 * **Two ways to move a row, because one of them does not work everywhere.** HTML5
 * drag and drop fires no events on a touch screen, so the grip is the pointer's
 * way in and the two arrows are everybody else's: a phone, a keyboard, a screen
 * reader. Both drive the same list, and the arrows are the ones with names.
 *
 * With script off nothing moves and nothing breaks: the rows are server-rendered
 * in the order they already have, so the form still saves which sections are seen
 * and writes the same order back.
 */

/** A section as this list needs it. `row` is the server-rendered cover and name. */
export type Section = { id: number; name: string; visible: boolean; row: ReactNode }

/** The list with `from` pulled out and put back at `to`. */
function moved(rows: Section[], from: number, to: number) {
  if (to < 0 || to >= rows.length || to === from) return rows
  const next = rows.slice()
  next.splice(to, 0, next.splice(from, 1)[0])
  return next
}

const ARROW =
  'border-rule bg-surface hover:border-accent focus-visible:outline-focus flex h-11 w-9 shrink-0 cursor-pointer items-center justify-center border focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default disabled:opacity-30'

export function SectionOrder({ sections }: { sections: Section[] }) {
  const [rows, setRows] = useState(sections)
  /**
   * Where the row being dragged is now, as an index. The list reorders on
   * `dragover` rather than on the drop, so the row follows the pointer and the
   * drop itself has nothing left to do -- and this has to be re-aimed at the index
   * the row just landed on, or the next hover drags the wrong one.
   */
  const [held, setHeld] = useState<number | null>(null)

  return (
    <ul className="border-rule mt-1 border-t">
      {rows.map((section, index) => (
        <li
          key={section.id}
          onDragOver={(event) => {
            if (held === null) return
            // Without this the row is not a drop target and the cursor says so.
            event.preventDefault()
            if (held === index) return
            setRows((current) => moved(current, held, index))
            setHeld(index)
          }}
          onDrop={(event) => event.preventDefault()}
          className={`border-rule flex items-center gap-4 border-b py-3 sm:gap-5 ${
            held === index ? 'opacity-50' : ''
          }`}
        >
          {/* Hidden on a phone: nothing there can start an HTML5 drag, and the
              width is worth more to the two arrows. `aria-hidden` because the
              arrows beside it are the same move with a name on it. */}
          <span
            draggable
            onDragStart={(event) => {
              // Firefox starts no drag unless something is on the transfer.
              event.dataTransfer.setData('text/plain', String(section.id))
              event.dataTransfer.effectAllowed = 'move'
              setHeld(index)
            }}
            onDragEnd={() => setHeld(null)}
            aria-hidden
            className="text-muted hover:text-text hidden shrink-0 cursor-grab leading-none select-none active:cursor-grabbing sm:block"
          >
            ⠿
          </span>

          {section.row}

          <input type="hidden" name="id" value={String(section.id)} />
          {/* One-based, so `position` keeps meaning what it already meant: the
              section screen reads it out as "en el lugar 3", and a new section is
              created at `max(position) + 1`. */}
          <input type="hidden" name="position" value={String(index + 1)} />

          <label className="flex shrink-0 items-center gap-2">
            <input
              type="checkbox"
              name="visible"
              value={String(section.id)}
              defaultChecked={section.visible}
              className="accent-accent focus-visible:outline-focus h-4 w-4 focus-visible:outline-2 focus-visible:outline-offset-2"
            />
            <span className="t-label">Se ve</span>
          </label>

          <span className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => setRows((current) => moved(current, index, index - 1))}
              disabled={index === 0}
              aria-label={`Subir ${section.name}`}
              className={ARROW}
            >
              <span aria-hidden>↑</span>
            </button>
            <button
              type="button"
              onClick={() => setRows((current) => moved(current, index, index + 1))}
              disabled={index === rows.length - 1}
              aria-label={`Bajar ${section.name}`}
              className={ARROW}
            >
              <span aria-hidden>↓</span>
            </button>
          </span>
        </li>
      ))}
    </ul>
  )
}
