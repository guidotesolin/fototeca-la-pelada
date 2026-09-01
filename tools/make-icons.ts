/**
 * Builds the header's mark from the authors' logo.
 *
 * The icons are not built here any more. They come from the Claude Design pass
 * "Favicon Fototeca" and live in `src/app/` under Next's own file conventions
 * (`favicon.ico`, `icon.png`, `icon1.png`, `apple-icon.png`). Its monogram is not
 * the logo's own F, so nothing here can reproduce it -- replacing an icon means
 * replacing the file.
 *
 * What is still generated is the header mark, because it needs a treatment the
 * exported logo does not have: the ground knocked out.
 *
 *   npm run icons
 */
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const ROOT = join(__dirname, '..')
const SOURCE = join(ROOT, 'brand', 'logo.png')

/** The logo's own ground, whose luminance becomes the alpha channel. */
const GROUND = { r: 0x25, g: 0x28, b: 0x2a }

/** `--text` from globals.css: the colour the header lays the lettering down in. */
const TEXT = { r: 0xed, g: 0xe6, b: 0xda }

/** The height the header draws the mark at; the file is written at twice it. */
const HEADER_HEIGHT = 44

/** The lockup's ink box, measured off the source rather than guessed. */
const LOCKUP = { left: 37, top: 74, width: 216, height: 139 }

/** Re-measures the ink box, so a new logo fails loudly instead of shipping askew. */
async function measure() {
  const { data, info } = await sharp(SOURCE).greyscale().raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info

  let top = h
  let bottom = 0
  let left = w
  let right = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[y * w + x] <= 110) continue
      if (y < top) top = y
      if (y > bottom) bottom = y
      if (x < left) left = x
      if (x > right) right = x
    }
  }
  const found = { left, top, width: right - left + 1, height: bottom - top + 1 }
  assert.deepEqual(
    found,
    LOCKUP,
    `brand/logo.png has moved: its ink box is now ${JSON.stringify(found)}.`,
  )
  console.log(`logo ${w}x${h}, ink box ${JSON.stringify(found)} — as expected`)
}

async function main() {
  await measure()

  const tall = HEADER_HEIGHT * 2
  const wide = Math.round((LOCKUP.width / LOCKUP.height) * tall)

  // The logo's ground is #25282a, lighter and bluer than the site's #1B1917, so left
  // in it reads as a patch pasted onto the header rather than as a mark on the page.
  // The artwork is white lettering on dark, so its own luminance is the alpha channel
  // -- but that ground's luminance is 39, not 0, and using it raw leaves the whole
  // rectangle at 15% opacity, a visible light patch in the shape of the crop. So the
  // channel is remapped to send 39 to nothing and paper-white to solid, and the
  // lettering is then laid down flat in `--text`.
  const ground = Math.round(0.299 * GROUND.r + 0.587 * GROUND.g + 0.114 * GROUND.b)
  const gain = 255 / (255 - ground)
  const alpha = await sharp(SOURCE)
    .extract(LOCKUP)
    .resize(wide, tall)
    .greyscale()
    .linear(gain, -ground * gain)
    .toColourspace('b-w')
    .raw()
    .toBuffer()

  const mark = await sharp({
    create: { width: wide, height: tall, channels: 3, background: TEXT },
  })
    .joinChannel(alpha, { raw: { width: wide, height: tall, channels: 1 } })
    .png({ compressionLevel: 9 })
    .toBuffer()

  writeFileSync(join(ROOT, 'src', 'brand', 'header-logo.png'), mark)
  console.log(`header-logo   ${wide}x${tall}, lettering on transparent  ${mark.length} bytes`)
}

main()
