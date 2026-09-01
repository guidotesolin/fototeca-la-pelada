'use client'

import { useEffect } from 'react'

/**
 * Light dismiss for the header menu.
 *
 * `<details>` gives the open/close state and the keyboard for free, and it means the
 * menu's markup is server-rendered -- but it has no notion of dismissing, so a menu
 * left open stays open. This adds the three gestures people expect and nothing else:
 * Escape, a press outside the menu, and following one of its own links.
 *
 * It renders no markup on purpose. The menu itself stays in the server component; a
 * client component that only attaches listeners keeps the section list out of the
 * bundle.
 */
export function MenuDismiss() {
  useEffect(() => {
    const open = () => document.querySelectorAll<HTMLDetailsElement>('details.menu[open]')

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      for (const menu of open()) {
        // A press on the summary is the native toggle's business, not ours. A press
        // on a link inside is ours: the layout is not remounted on a client
        // navigation, so `open` would survive it and greet the next page.
        if (!menu.contains(target) || (target as Element).closest?.('a')) menu.open = false
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      for (const menu of open()) {
        menu.open = false
        // Escape should hand the focus back to what opened the menu, not drop it.
        menu.querySelector('summary')?.focus()
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  return null
}
