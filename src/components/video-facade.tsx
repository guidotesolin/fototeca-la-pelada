'use client'

import { useState } from 'react'
import { PlayBadge } from '@/components/play-badge'
import { videoEmbedUrl, videoWatchUrl } from '@/lib/url'

/**
 * A poster and a play button, and the player only once somebody asks for it.
 *
 * **This is _Mobile first_ applied to a third party.** A YouTube iframe on the
 * page is hundreds of KB of Google's JavaScript fetched before anybody has
 * decided to watch anything, over the rural mobile data this archive is read on.
 * So nothing here reaches Google at all: the poster is the archive's own copy,
 * served from R2 like every other image, and the frame is created on the click.
 *
 * **With no JavaScript it is a link, and that is the whole degradation.** The
 * anchor is real markup in the server HTML with a real `href`, so an embedded
 * WhatsApp browser with a broken bundle still gets somebody to the interview --
 * and a middle click or ctrl-click opens it in a tab, which is what a reader
 * pressing those expects rather than something a handler swallowed.
 *
 * The poster arrives as `children` so the `<picture>` and its `srcset` stay on
 * the server: this component ships a `useState` and nothing else.
 *
 * A CSS-only version was tried and does not exist. An `<iframe>` inside a closed
 * `<details>` still loads its `src`, and a server-rendered `?ver=1` would read
 * `searchParams`, which Next 16 documents as a request-time API -- that is the
 * whole pre-rendered page traded for a button.
 */
export function VideoFacade({
  youtubeId,
  title,
  play,
  children,
}: {
  youtubeId: string
  title: string
  /** "Reproducir la entrevista", in the reader's language. */
  play: string
  children: React.ReactNode
}) {
  const [playing, setPlaying] = useState(false)

  if (playing) {
    return (
      <iframe
        // `autoplay` because the reader just pressed play: without it they press
        // twice, and the second press is inside Google's player.
        src={`${videoEmbedUrl(youtubeId)}&autoplay=1`}
        title={title}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        /* Both, and Chrome logs a warning saying the first wins. That is the
           point: `allowfullscreen` is the only one an old embedded WebView
           understands, which is exactly the browser _Mobile first_ is written
           for -- the same reason `X-Frame-Options` is kept beside
           `frame-ancestors`. `compute-pressure` is deliberately **not** granted:
           the archive's Permissions-Policy exists to hand out nothing it does not
           need, and the player runs without it. */
        allowFullScreen
        className="absolute inset-0 h-full w-full border-0"
      />
    )
  }

  return (
    <a
      href={videoWatchUrl(youtubeId)}
      onClick={(event) => {
        // Only a plain left click is ours. A modified click is the reader asking
        // for a tab, and the anchor already does that correctly.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        setPlaying(true)
      }}
      className="group focus-visible:outline-focus absolute inset-0 block focus-visible:outline-2 focus-visible:-outline-offset-2"
    >
      {children}
      <PlayBadge />
      <span className="sr-only">{play}</span>
    </a>
  )
}
