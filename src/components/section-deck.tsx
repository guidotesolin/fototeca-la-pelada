'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import type { SectionDeckProps } from '@/components/section-deck-swiper'

/**
 * Swiper and the deck it draws, fetched the moment the viewport turns out to be
 * wide enough and never before. `ssr: false` because the gate below is a browser
 * measurement -- there is no width to read on the server, which is also why the
 * deck has never travelled in the server HTML.
 *
 * The import is a `next/dynamic` rather than a plain one so the package lands in a
 * chunk of its own: statically imported it rode the index's bundle to every phone,
 * 30 KB over the wire to render `null`. A type-only import of the props is erased
 * at compile time and pulls nothing.
 */
const SectionDeckSwiper = dynamic(() => import('@/components/section-deck-swiper'), { ssr: false })

/**
 * True only when the deck has room. It mounts only then, rather than hiding with
 * `display: none`: a hidden container cannot be measured, and Swiper was left with
 * stale geometry — the active card off centre — when a reader crossed the
 * breakpoint by widening the window.
 */
function useWideEnough(query = '(min-width: 900px)') {
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const sync = () => setWide(mq.matches)
    sync()
    // Both: `change` is the correct event, and `resize` covers the environments
    // that emulate the viewport without emitting it. It costs one listener and
    // avoids staying mounted at a width where the deck does not fit.
    mq.addEventListener('change', sync)
    window.addEventListener('resize', sync)
    return () => {
      mq.removeEventListener('change', sync)
      window.removeEventListener('resize', sync)
    }
  }, [query])
  return wide
}

/**
 * The gate, and nothing else -- 900 px and up, which on phone and tablet leaves
 * the card list, which is also what a reader browsing without JavaScript sees.
 *
 * **The space it will take is reserved by the server**, in `.deck-slot`: this
 * component cannot decide anything until it has hydrated and measured, and until
 * T16 that meant 396 px of deck appearing under the title and shoving the page
 * down. It was the whole of the index's layout shift on desktop -- CLS 0.189,
 * 0.167 of it this -- and invisible on a phone, where the gate stays shut. The
 * slot is a media query and no JavaScript, so the hole is in the first paint.
 */
export function SectionDeck(props: SectionDeckProps) {
  const wide = useWideEnough()

  if (!wide) return null

  return <SectionDeckSwiper {...props} />
}
