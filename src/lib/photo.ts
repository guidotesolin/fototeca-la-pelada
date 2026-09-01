/**
 * The naming contract for a photo's files, shared by everything that writes them
 * (the seed, the admin import) and everything that reads them (the public site).
 * No image encoder in here on purpose: a page that needs a URL should not drag
 * sharp into its bundle.
 *
 *   prefix       photos/campo-078-Ku3nR2xQp9Vf
 *   derivative   <prefix>-960.avif
 *   master       <prefix>.jpg
 */

/** A 360 px phone must never download a 1440 px image. */
export const WIDTHS = [480, 960, 1440] as const

/** AVIF first in the `<picture>`, WebP as the fallback every browser reads. */
export const FORMATS = ['avif', 'webp'] as const

export type Format = (typeof FORMATS)[number]

export function keyFor(prefix: string, width: number, format: Format): string {
  return `${prefix}-${width}.${format}`
}

export function masterKeyFor(prefix: string, ext: string): string {
  return `${prefix}.${ext}`
}

export function publicUrl(key: string): string {
  const base = process.env.NEXT_PUBLIC_IMAGE_BASE_URL
  if (!base) throw new Error('NEXT_PUBLIC_IMAGE_BASE_URL is not set')
  return `${base.replace(/\/$/, '')}/${key}`
}

/**
 * The renditions a photo actually has. `webWidth` is its largest, which is either
 * a standard step or the master's own width when it fell between two — so the
 * list is every step below it, plus itself.
 */
function widthsFor(webWidth: number): number[] {
  return [...WIDTHS.filter((w) => w < webWidth), webWidth]
}

export function srcSetFor(webKey: string, webWidth: number, format: Format): string {
  return widthsFor(webWidth)
    .map((w) => `${publicUrl(keyFor(webKey, w, format))} ${w}w`)
    .join(', ')
}
