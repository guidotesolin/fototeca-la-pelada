'use client'

import { useState } from 'react'

/**
 * The map's frame, empty until somebody asks for the map.
 *
 * **The same decision as `video-facade.tsx`, and the place it was missed.** That
 * component's note says a YouTube iframe is "hundreds of KB of Google's
 * JavaScript fetched before anybody has decided to watch anything, over the rural
 * mobile data this archive is read on" -- and the map on the index was doing
 * exactly that, worse. Measured on the deployed site: **479 KB of Maps JavaScript
 * and 484 ms of main thread**, plus a further ~225 KB of tiles, on the one page
 * every reader arrives at. The index's LCP is the intro paragraph, and its
 * breakdown was 5 ms of server and 2.3 s of render delay -- the text was waiting
 * for Google, not for us.
 *
 * `loading="lazy"` was already on the iframe and does not help: Chrome's
 * distance-from-viewport threshold on a slow connection is around 3000 px, and
 * the map is far inside it. The only way not to pay for the map is not to create
 * it.
 *
 * **With no JavaScript it is a link, and that is the whole degradation** -- the
 * anchor is real markup in the server HTML with a real `href`, the same shape the
 * video facade degrades to, so a broken bundle in an embedded WhatsApp browser
 * still gets somebody to a map.
 *
 * ponytail: that `href` is the embed address itself, which Google does serve
 * standalone -- a bare map with no chrome rather than the real Maps page. Turning
 * it into one would mean reading the coordinates out of it, and the panel accepts
 * two shapes: `maps-api-ssl.google.com/maps?ll=<lat>,<lng>&output=embed`, which
 * carries them in the open, and `www.google.com/maps/embed?pb=!1m10!…`, which
 * buries them in an undocumented blob. Code that handles the first and not the
 * second is a fallback that works on whichever URL happens to be in the database
 * today, which is worse than one that always works a little plainly.
 */
export function MapFacade({ src, title, open }: { src: string; title: string; open: string }) {
  const [shown, setShown] = useState(false)

  if (shown) {
    return (
      <iframe
        src={src}
        title={title}
        referrerPolicy="no-referrer-when-downgrade"
        className="absolute inset-0 h-full w-full border-0"
      />
    )
  }

  return (
    <a
      href={src}
      onClick={(event) => {
        // Only a plain left click is ours. A modified click is the reader asking
        // for a tab, and the anchor already does that correctly.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        setShown(true)
      }}
      className="bg-surface-high text-muted hover:text-accent focus-visible:outline-focus absolute inset-0 flex flex-col items-center justify-center gap-4 focus-visible:outline-2 focus-visible:-outline-offset-2"
    >
      {/* Drawn from primitives at the footer's stroke, like the three network
          marks and the header's gear: this design is built from hairlines, and a
          filled map pin would sit in it as a foreign object. */}
      <svg
        width="40"
        height="40"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 21.3c4.6-4.4 6.9-8 6.9-10.8a6.9 6.9 0 1 0-13.8 0c0 2.8 2.3 6.4 6.9 10.8Z" />
        <circle cx="12" cy="10.3" r="2.6" />
      </svg>
      <span className="t-label">{open}</span>
    </a>
  )
}
