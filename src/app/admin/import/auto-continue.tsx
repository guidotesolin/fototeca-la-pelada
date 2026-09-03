'use client'

import { useEffect, useRef } from 'react'

/**
 * What turns "import this one" into "import the whole selection": a hidden submit
 * button that presses itself once per render, so the screen asks for the next
 * photograph as soon as the last one is in.
 *
 * **It is the only part of this screen that needs JavaScript, and nothing
 * depends on it.** The form and its two real buttons are server-rendered, so
 * with script off the person presses the button once per photograph and watches
 * the count go up -- the same import, at the same pace, one click at a time.
 *
 * `step` is how many of the folder's files are already in, so it rises by
 * exactly one per success. That makes it the loop's guard as well as its clock:
 * if an import somehow succeeds without leaving one more file imported, `step`
 * does not change, the effect does not fire again, and the loop stops instead of
 * spinning against Drive. The screen only renders this when the last import
 * succeeded and something it was asked for is still waiting.
 *
 * It carries no fields of its own: the run's own work is the ticked boxes, and
 * they are already in the form it is resubmitting.
 */
export function AutoContinue({ step }: { step: number }) {
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    button.current?.click()
  }, [step])
  return <button ref={button} type="submit" hidden />
}
