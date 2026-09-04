/**
 * The mark over a video's poster, and the Videoteca's whole chrome.
 *
 * Disc and triangle are both drawn **inside** the SVG rather than a triangle over
 * a CSS-padded box: padding on an inline `<svg>` does not do what it looks like it
 * does -- the viewBox scales into the padding box, so the first version rendered a
 * 36px dot with the triangle stretched across it and effectively invisible.
 * Measured on the running build, not reasoned about.
 *
 * `aria-hidden`, because the link around it carries the words.
 */
export function PlayBadge({ size = 64 }: { size?: number }) {
  return (
    <span className="play-badge" aria-hidden>
      <svg width={size} height={size} viewBox="0 0 48 48" className="play-badge-mark">
        <circle cx="24" cy="24" r="23" className="play-badge-disc" />
        {/* Nudged right of centre: an optical centre, since a triangle's mass sits
            behind its point. */}
        <path d="M20 15.5v17l14-8.5z" fill="currentColor" />
      </svg>
    </span>
  )
}
