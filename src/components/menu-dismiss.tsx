'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

const openMenus = () => document.querySelectorAll<HTMLDetailsElement>('details.menu[open]')

/**
 * Closing a `<details>` un-renders its contents, so if the reader's focus was inside
 * it the browser drops it on `<body>` at the next layout -- measured, and not
 * synchronously, which is what makes it easy to miss. That resets the tab order and
 * the screen reader's cursor to the top of the document. Hand the focus back to the
 * control that opened the menu instead, which is where the reader was.
 *
 * Only when it was actually inside: Escape in the search field closes the menu too,
 * and a reader clearing that field must not be thrown up to the summary.
 */
function close(menu: HTMLDetailsElement) {
  const held = menu.contains(document.activeElement)
  menu.open = false
  if (held) menu.querySelector('summary')?.focus()
}

/**
 * Light dismiss for the header menus.
 *
 * `<details>` gives the open/close state and the keyboard for free, and it means the
 * menus' markup is server-rendered -- but it has no notion of dismissing, so a menu
 * left open stays open. This adds the gestures people expect and nothing else:
 * Escape, a press outside, and a navigation.
 *
 * It renders no markup on purpose. The menus stay in the server component; a client
 * component that only attaches listeners keeps the section list out of the bundle.
 */
export function MenuDismiss() {
  const pathname = usePathname()

  /**
   * A navigation, not a click on a link.
   *
   * The invariant is that a menu must not outlive the page it was opened on -- the
   * layout is not remounted on a client navigation, so `open` would survive it and
   * greet the next page. Keying that to the pathname says exactly this, and closing
   * on the link's press instead was wrong in four directions at once: it hid the
   * anchor before `pointerup`, so the browser retargeted the click to `body` and the
   * section was simply unclickable; it fired on Ctrl- and middle-click, shutting the
   * panel on the page the reader was still reading; it missed Back, which leaves the
   * panel hanging over the previous page; and it missed Enter on any link outside
   * the panel. This effect has none of those, and it runs after the router has
   * settled, so nothing is un-rendered while it holds the focus.
   *
   * `usePathname` is safe to read here: it is used in an effect and never rendered,
   * so the rewrite caveat in Next's docs -- which is about prerendered HTML
   * disagreeing with the client's URL -- has nothing to disagree with. `proxy.ts`
   * rewrites nothing in any case; it answers 410 or passes through.
   */
  useEffect(() => {
    for (const menu of openMenus()) close(menu)
  }, [pathname])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      for (const menu of openMenus()) {
        // A press on the summary is the native toggle's business, not ours, and a
        // press inside the panel belongs to whatever it landed on.
        if (!menu.contains(target)) close(menu)
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      for (const menu of openMenus()) close(menu)
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
