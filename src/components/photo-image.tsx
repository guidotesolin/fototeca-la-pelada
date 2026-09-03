import { keyFor, publicUrl, srcSetFor } from '@/lib/photo'
import type { PhotoCard } from '@/db/queries/gallery'

/**
 * The three strings this frame can render, translated by whoever renders it.
 *
 * They arrive as props rather than being read here, and that is forced: the
 * section deck is a client component and imports this file, so this module is in
 * the client bundle and cannot call `getTranslations`. `photoImageLabels` in
 * `i18n/labels.ts` builds one of these on the server; every caller passes it.
 *
 * **This is where T13 first missed.** The two veil strings and the fallback `alt`
 * were inline Spanish and stayed that way through the whole i18n pass, because
 * the photo page states its warning in a card of its own and passes
 * `veil={false}` — so the one screen anybody thought to check was the one screen
 * that never drew them. They were Spanish on every English, French and Italian
 * gallery card, search result, featured strip and section cover.
 */
export type PhotoImageLabels = {
  /**
   * The accessible name a photograph with no caption falls back to — 73 of the
   * 592 (F1). It no longer repeats the credit, which the `<figcaption>` beside it
   * already carries: a translated sentence cannot interpolate a per-photograph
   * value without becoming a function, and a function does not cross a client
   * boundary. Losing the repetition costs a screen reader nothing.
   */
  altNoCaption: string
  /** The veil's own two, over a sensitive thumbnail. */
  warning: string
  reveal: string
}

/**
 * A photograph, framed and mounted: the `<picture>` with AVIF first, the print
 * edge, and the veil when it is sensitive. Both the gallery and the section index
 * compose this — they differ in what goes underneath and in whether the frame
 * keeps the photograph's own proportion.
 *
 * The frame reserves its height before anything loads, which is the whole of the
 * layout-shift story.
 */
export function PhotoImage({
  photo,
  sizes,
  priority = false,
  ratio,
  fill = false,
  veil = true,
  labels,
}: {
  photo: PhotoCard
  sizes: string
  labels: PhotoImageLabels
  priority?: boolean
  /** Defaults to the photograph's own. An index passes a uniform one so the rows line up. */
  ratio?: string
  /** For the deck, where the card sets the size and the frame follows it. */
  fill?: boolean
  /**
   * The photo page states the warning in a card of its own, above the image, and
   * that card carries the control that lifts the blur. Only the blur stays here.
   */
  veil?: boolean
}) {
  const { webKey, webWidth, webHeight, caption, sensitive } = photo
  const alt = caption ?? labels.altNoCaption

  return (
    <div
      className={`relative overflow-hidden ${fill ? 'h-full w-full' : 'print'}`}
      style={fill ? undefined : { aspectRatio: ratio ?? `${webWidth} / ${webHeight}` }}
    >
      <picture>
        <source type="image/avif" srcSet={srcSetFor(webKey, webWidth, 'avif')} sizes={sizes} />
        <source type="image/webp" srcSet={srcSetFor(webKey, webWidth, 'webp')} sizes={sizes} />
        <img
          src={publicUrl(keyFor(webKey, webWidth, 'webp'))}
          /* The caption at every state. It used to be emptied for a sensitive
             photograph, which protected nobody -- the same caption is in the
             `<figcaption>` beside the link, read out either way -- and cost the
             link its only accessible name wherever the veil is not drawn: the
             photo page, which passes `veil={false}`, and every gallery card once
             the reader turns the archive-wide preference on. */
          alt={alt}
          width={webWidth}
          height={webHeight}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          decoding="async"
          /* `sensitive-blur` carries no blur of its own: it is the handle the
             archive-wide preference from the header reaches for. See the note
             beside that rule in globals.css. */
          className={`h-full w-full object-cover ${sensitive ? 'sensitive-blur scale-110 blur-[9px]' : ''}`}
        />
      </picture>
      {sensitive && veil && (
        <div className="sensitive-veil bg-ground/85 absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
          <p className="text-text font-sans text-[11px] leading-tight">{labels.warning}</p>
          <span className="text-accent font-sans text-[11px] underline underline-offset-2">
            {labels.reveal}
          </span>
        </div>
      )}
    </div>
  )
}
