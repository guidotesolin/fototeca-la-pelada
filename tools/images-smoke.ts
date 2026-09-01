/**
 * Smoke test for the image pipeline, run against real photos from the rescued
 * archive rather than a synthetic fixture. Checks the three things T3 promises:
 * the derivatives come out, the keys are not derivable, and deleting really
 * removes the files.
 *
 * The R2 half is skipped when there are no credentials, so this is useful offline.
 *
 *   npm run images:smoke
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { derive, read } from '../src/lib/images'
import { FORMATS, WIDTHS, keyFor, masterKeyFor } from '../src/lib/photo'
import { exists, newPrefix, put, removePrefix } from '../src/lib/r2'

try {
  process.loadEnvFile('.env.local')
} catch {
  // Fine: the R2 half will report itself as skipped.
}

type Photo = { slug: string; file: string; width: number; height: number; bytes: number }

const ARCHIVE = join(__dirname, '..', 'archive')
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`

/** `.env.example` ships deliberately fake values, and a fake account id is not a bucket. */
function r2Configured(): boolean {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env
  const secrets = [R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY]
  return Boolean(R2_BUCKET) && secrets.every((v) => v && !v.startsWith('example-'))
}

function archivePhotos(): Photo[] {
  const json = JSON.parse(readFileSync(join(ARCHIVE, 'archive.json'), 'utf8'))
  return json.sections.flatMap((s: { photos: Photo[] }) => s.photos)
}

async function main() {
  const photos = archivePhotos()
  const wide = photos.find((p) => p.width >= WIDTHS[WIDTHS.length - 1])
  const narrow = photos.reduce((a, b) => (a.width <= b.width ? a : b))
  assert.ok(wide, 'the archive has a master at least as wide as the widest rendition')

  // --- the bytes describe themselves, and they agree with what T1 recorded ---
  const wideData = readFileSync(join(ARCHIVE, 'originals', wide.file))
  const master = await read(wideData)
  assert.equal(master.width, wide.width, 'sharp agrees with archive.json on width')
  assert.equal(master.height, wide.height, 'sharp agrees with archive.json on height')
  assert.equal(master.bytes, wide.bytes, 'sharp agrees with archive.json on size')

  // --- six derivatives from a master wide enough for all three widths ---
  const { renditions } = await derive(wideData)
  assert.equal(renditions.length, WIDTHS.length * FORMATS.length, 'six derivatives')
  for (const width of WIDTHS) {
    const pair = renditions.filter((r) => r.width === width)
    assert.equal(pair.length, FORMATS.length, `both formats at ${width} px`)
    const avif = pair.find((r) => r.format === 'avif')!
    const webp = pair.find((r) => r.format === 'webp')!
    assert.ok(avif.data.length < webp.data.length, `AVIF is the smaller one at ${width} px`)
    console.log(
      `  ${String(width).padStart(4)} px   avif ${kb(avif.data.length).padStart(9)}` +
        `   webp ${kb(webp.data.length).padStart(9)}` +
        `   −${Math.round((1 - avif.data.length / webp.data.length) * 100)}%`,
    )
  }
  assert.ok(
    renditions.every((r) => r.width <= master.width),
    'nothing was upscaled past the master',
  )

  // --- a narrow master yields fewer, on purpose ---
  const narrowData = readFileSync(join(ARCHIVE, 'originals', narrow.file))
  const small = await derive(narrowData)
  assert.equal(
    small.renditions.length,
    FORMATS.length,
    `${narrow.slug} yields one width, not three`,
  )
  assert.ok(
    small.renditions.every((r) => r.width === narrow.width),
    'and it is the master width, not an upscale',
  )
  console.log(
    `  ${narrow.slug}: ${narrow.width} px master -> ${small.renditions.length} renditions`,
  )

  // --- a master between two steps is still served at its own width ---
  const between = photos.find((p) => p.width > WIDTHS[0] * 1.2 && p.width < WIDTHS[1] * 0.9)
  if (between) {
    const mid = await derive(readFileSync(join(ARCHIVE, 'originals', between.file)))
    const widths = [...new Set(mid.renditions.map((r) => r.width))]
    assert.ok(
      widths.includes(between.width),
      `${between.slug} (${between.width} px) keeps its own width, got ${widths.join(', ')}`,
    )
    console.log(`  ${between.slug}: ${between.width} px master -> widths ${widths.join(', ')}`)
  }

  // --- a master is validated by content, not by what it claims to be ---
  await assert.rejects(read(Buffer.from('this is not an image')), /unsupported|unreadable/)
  await assert.rejects(read(Buffer.alloc(41 * 1024 * 1024)), /over the 40 MB limit/)

  // --- keys nobody can derive ---
  const a = newPrefix('photos', wide.slug)
  const b = newPrefix('photos', wide.slug)
  assert.notEqual(a, b, 'the same photo gets a different prefix every time')
  assert.match(a, /^photos\/[a-z0-9-]+-[A-Za-z0-9_-]{12}$/, 'prefix carries a 12-char token')
  assert.equal(keyFor(a, 960, 'avif'), `${a}-960.avif`)
  assert.equal(masterKeyFor(a, 'jpg'), `${a}.jpg`)

  // --- and the round trip, when there is a bucket to talk to ---
  if (!r2Configured()) {
    console.log('\nimages ok (R2 round trip skipped: .env.local still has the example values)')
    return
  }

  const prefix = newPrefix('photos', `smoke-test-${wide.slug}`)
  for (const r of renditions) await put(keyFor(prefix, r.width, r.format), r.data, r.format)
  const probe = keyFor(prefix, renditions[0].width, renditions[0].format)
  assert.equal(await exists(probe), true, 'the derivative is there after uploading')

  const removed = await removePrefix(prefix)
  assert.equal(removed, renditions.length, 'the takedown removed every derivative')
  assert.equal(await exists(probe), false, 'and the key stops answering')
  console.log(`\nimages ok: 6 derivatives, non-derivable keys, ${removed} uploaded and removed`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
