/**
 * The networks' marks, drawn from primitives instead of pasted brand paths. This design
 * is built from hairlines -- the mount's inner rule, the search field's underline,
 * the plate's top border -- so a stroked glyph belongs where a solid logo would sit
 * as a foreign object. They carry no colour of their own: `currentColor` means the
 * footer's accent, its hover and its focus ring all reach them for free.
 *
 * 20px at stroke 2.1, and not the 17px the label is set at: rasterised at the real
 * size, a thinner stroke lands between pixels and antialiases down to a dim brown --
 * the f stops being legible and Instagram's dot disappears on a 1x screen. Checked
 * by rendering the sizes against the strokes rather than by eye at display scale.
 */
export function NetworkIcon({ name }: { name: string }) {
  const shape = {
    Facebook: (
      <>
        <circle cx="12" cy="12" r="9.25" />
        <path d="M15.1 8.1h-2.05c-1.1 0-1.8.78-1.8 1.92V21.2" />
        <path d="M9.2 13.45h5.3" />
      </>
    ),
    Instagram: (
      <>
        <rect x="3.4" y="3.4" width="17.2" height="17.2" rx="5" />
        <circle cx="12" cy="12" r="4.15" />
        <circle cx="17.05" cy="6.95" r="1.15" fill="currentColor" stroke="none" />
      </>
    ),
    YouTube: (
      <>
        <rect x="2.4" y="5.7" width="19.2" height="12.6" rx="3.6" />
        <path d="M10.55 9.4 15.85 12l-5.3 2.6Z" fill="currentColor" stroke="none" />
      </>
    ),
    X: (
      <>
        <path d="M4.6 4.4h4.1l10.7 15.2h-4.1Z" />
        <path d="M19.1 4.4 13.3 11M10.7 13.4 4.9 19.6" />
      </>
    ),
    WhatsApp: (
      <>
        <path d="M4.2 19.8 5.3 16A8.65 8.65 0 1 1 8.1 18.7Z" />
        <path
          d="M9.3 7.9c.35-.2.8-.1 1 .25l.85 1.7c.15.3.1.65-.15.9l-.5.5a5.3 5.3 0 0 0 2.25 2.25l.5-.5c.25-.25.6-.3.9-.15l1.7.85c.35.2.45.65.25 1-.55.95-1.6 1.4-2.65 1.1a7.4 7.4 0 0 1-5.25-5.25c-.3-1.05.15-2.1 1.1-2.65Z"
          fill="currentColor"
          stroke="none"
        />
      </>
    ),
  }[name]

  if (!shape) return null

  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      {shape}
    </svg>
  )
}
