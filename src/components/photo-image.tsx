import { keyFor, publicUrl, srcSetFor } from '@/lib/photo'
import type { PhotoCard } from '@/db/queries/gallery'

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
}: {
  photo: PhotoCard
  sizes: string
  priority?: boolean
  /** Defaults to the photograph's own. An index passes a uniform one so the rows line up. */
  ratio?: string
  /** For the deck, where the card sets the size and the frame follows it. */
  fill?: boolean
}) {
  const { webKey, webWidth, webHeight, caption, credit, sensitive } = photo
  const alt = caption ?? `Fotografía sin epígrafe${credit ? `. Cortesía: ${credit}` : ''}`

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
          alt={sensitive ? '' : alt}
          width={webWidth}
          height={webHeight}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          decoding="async"
          className={`h-full w-full object-cover ${sensitive ? 'scale-110 blur-[9px]' : ''}`}
        />
      </picture>
      {sensitive && (
        <div className="bg-ground/85 absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
          <p className="text-text font-sans text-[11px] leading-tight">
            Contiene imágenes de faena de animales
          </p>
          <span className="text-accent font-sans text-[11px] underline underline-offset-2">
            Ver la fotografía
          </span>
        </div>
      )}
    </div>
  )
}
