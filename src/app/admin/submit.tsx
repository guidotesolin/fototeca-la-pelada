'use client'

import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { BUTTON } from './ui'

/**
 * A submit button that says it is working.
 *
 * The panel's writes are mostly a redirect away, and two of them are not: "Ver la
 * carpeta" is two round trips to Drive, and an import is a master downloaded, six
 * encodes and six uploads. Both took seconds with nothing on screen moving, and a
 * button that does nothing visible when pressed reads as a button that does not
 * work -- which is exactly how it was reported.
 *
 * **Two kinds of form, two ways of knowing, and `navigates` picks one.** A form
 * with a server action is submitted by React, so `useFormStatus` sees it go and
 * sees it come back -- which matters here, because the screen stays mounted across
 * the action's redirect and a flag of our own would never be lowered. A plain
 * `method="get"` form is submitted by the browser and React never learns of it, so
 * `pending` stays false there for ever; that one listens for the form's own
 * `submit` event instead, and never has to undo it because the page is already on
 * its way out.
 *
 * With script off this is a button: server-rendered, no state, and the form posts
 * the way the rest of the panel does.
 */
export function Submit({
  children,
  busy,
  navigates = false,
  className = BUTTON,
  ...rest
}: ComponentProps<'button'> & {
  /** What it says while the form is in flight. */
  busy: ReactNode
  /** True for a plain `method="get"` form, which the browser submits itself. */
  navigates?: boolean
}) {
  const { pending, data } = useFormStatus()
  const button = useRef<HTMLButtonElement>(null)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const form = navigates ? button.current?.form : null
    if (!form) return
    const going = () => setLeaving(true)
    form.addEventListener('submit', going)
    return () => form.removeEventListener('submit', going)
  }, [navigates])

  const working = navigates ? leaving : pending

  /**
   * Every button in the form goes dead while it is in flight, because the second
   * import started from the other one is the thing worth stopping -- but only the
   * one that was actually pressed changes what it says. `data` is the payload
   * React sent, and a submit button's name reaches a form's data only when it was
   * the button pressed, so this is the form itself saying which.
   */
  const pressed = working && (!rest.name || data?.get(rest.name) === String(rest.value))

  return (
    <button
      ref={button}
      type="submit"
      {...rest}
      disabled={working || rest.disabled}
      aria-busy={pressed}
      className={className}
    >
      {pressed ? busy : children}
    </button>
  )
}
