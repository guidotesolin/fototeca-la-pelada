import sharp from 'sharp'

/**
 * Derivatives for the public site. Everything here runs once, at import time,
 * never inside a request: that is what lets us afford AVIF, and it is why Vercel's
 * 5,000 image transformations per month are never touched.
 */

/** A 360 px phone must never download a 1440 px image. */
export const WIDTHS = [480, 960, 1440] as const

/**
 * How much bigger than the widest step it reached a master has to be to earn a
 * rendition at its own width. Without this a 920 px master is served at 480,
 * throwing away half of what we have on the one screen built for looking closely.
 * ponytail: a flat threshold, not a perceptual one. Tune it if the bytes bite.
 */
const OWN_WIDTH_PAYS = 1.15

/** AVIF first in the `<picture>`, WebP as the fallback every browser reads. */
export const FORMATS = ['avif', 'webp'] as const

/** What we accept as a master. Anything else is rejected before sharp touches it. */
const INPUT_FORMATS = new Set(['jpeg', 'png', 'webp', 'tiff', 'avif', 'heif', 'gif'])

/** A scan has no business being larger than this, and an upload even less. */
const MAX_BYTES = 40 * 1024 * 1024

export type Format = (typeof FORMATS)[number]

export type Rendition = {
  width: number
  height: number
  format: Format
  data: Buffer
}

export type Master = {
  format: string
  width: number
  height: number
  bytes: number
}

/**
 * What the bytes actually are, read from the bytes themselves — never from a file
 * extension or from the content type a client claims. sharp also caps input
 * pixels by default, which is what stops a decompression bomb.
 */
export async function read(data: Buffer): Promise<Master> {
  if (data.byteLength > MAX_BYTES) {
    const mb = (n: number) => Math.round(n / 1024 / 1024)
    throw new Error(`image is ${mb(data.byteLength)} MB, over the ${mb(MAX_BYTES)} MB limit`)
  }
  const meta = await sharp(data).metadata()
  if (!meta.format || !INPUT_FORMATS.has(meta.format)) {
    throw new Error(`unsupported image format: ${meta.format ?? 'unreadable'}`)
  }
  if (!meta.width || !meta.height) throw new Error('image has no readable dimensions')
  return { format: meta.format, width: meta.width, height: meta.height, bytes: data.byteLength }
}

/**
 * The renditions the site serves: each width up to the master's own, in both
 * formats. A master narrower than 1440 px yields fewer than six, on purpose —
 * upscaling costs bytes and adds no detail, and half this archive is under
 * 1024 px wide. Metadata is dropped, which is both smaller and one less way to
 * publish something a donor did not mean to hand over.
 */
/**
 * The widths worth encoding for one master: the standard steps it can fill, plus
 * its own width when that is meaningfully larger than the last step it reached.
 * Never wider than the widest step, and never an upscale.
 */
function targetWidths(masterWidth: number): number[] {
  const capped = Math.min(masterWidth, WIDTHS[WIDTHS.length - 1])
  const steps = WIDTHS.filter((w) => w <= capped)
  const largest = steps[steps.length - 1] ?? 0
  return steps.length && capped < largest * OWN_WIDTH_PAYS ? steps : [...steps, capped]
}

export async function derive(data: Buffer): Promise<{ renditions: Rendition[]; master: Master }> {
  const master = await read(data)
  const renditions: Rendition[] = []

  // ponytail: decodes the master once per width instead of sharing one decode across
  // the pipeline. Costs seconds over the 592 photos; worth revisiting at thousands.
  for (const width of targetWidths(master.width)) {
    const resized = sharp(data).resize({ width, withoutEnlargement: true })
    for (const format of FORMATS) {
      const encoded =
        format === 'avif'
          ? resized.clone().avif({ quality: 50 })
          : resized.clone().webp({ quality: 78 })
      const { data: out, info } = await encoded.toBuffer({ resolveWithObject: true })
      renditions.push({ width: info.width, height: info.height, format, data: out })
    }
  }

  return { renditions, master }
}
