/**
 * Smoke test for the takedown, which is the half of T10's acceptance criterion
 * that has teeth: unpublishing has to make the image unreachable at its URL, and
 * republishing has to bring it back.
 *
 * Three things are checked, and the first is the dangerous one. `removePrefix`
 * deletes **everything** below what it is handed, so a prefix computed wrong --
 * `photos/`, or an empty string, which lists the whole bucket -- would take the
 * derivatives of the entire archive with it. `dropDerivatives` is the only door
 * to it, and this asserts that the door refuses every shape that is not one
 * photograph's own prefix.
 *
 * The second is a real round trip against real R2, on objects of its own: encode,
 * upload, confirm every rendition answers **at its URL**, delete, confirm none
 * does. It runs twice, on two masters that produce **different numbers of
 * renditions** -- six and four -- because nothing is upscaled and a master that
 * falls between two steps earns a rendition at its own width. T4 measured the
 * archive's average at 4.6 per photograph, so a delete that assumed six would
 * leave files alive and the takedown would be a lie.
 *
 * The third is the other direction: generating again produces a **new** prefix,
 * a complete set, and leaves the addresses the takedown killed dead.
 *
 * It never touches an archive row, so it is safe to run any time.
 *
 *   npm run takedown:smoke
 */
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { dropDerivatives, dropRestoredMaster, generate } from '../src/lib/derivatives'
import { FORMATS, keyFor, publicUrl } from '../src/lib/photo'
import { exists, listKeys, removePrefix } from '../src/lib/r2'

try {
  process.loadEnvFile('.env.local')
} catch {
  // Fine: the variables may come from the environment instead.
}

/** Its own corner of the bucket, so a crashed run leaves something recognisable. */
const SLUG = 'takedown-smoke'

/**
 * Two masters and the renditions each one earns, worked out from the rules in
 * `lib/images.ts` rather than from a fixed count:
 *
 * - 1600 px is capped at the widest step, so it fills 480/960/1440 -- six files.
 * - 700 px reaches only the 480 step, and sits far enough above it to earn a
 *   rendition at its own width, so it is 480/700 -- four files. This is the case
 *   a hard-coded six would miss, and half this archive is under 1024 px wide.
 */
const CASES = [
  { width: 1600, height: 1000, widths: [480, 960, 1440] },
  { width: 700, height: 500, widths: [480, 700] },
]

async function testImage(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
      // Not flat: a solid colour compresses to almost nothing and would not
      // exercise the encoder the way a photograph does. The background is only
      // here because sharp's types require it alongside `noise`.
      noise: { type: 'gaussian', mean: 128, sigma: 30 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer()
}

/** Every shape that must never reach `removePrefix`, and what each one would cost. */
const REFUSED: [string, string][] = [
  ['photos/', 'every derivative in the archive'],
  ['photos', 'the same, without the slash'],
  ['masters/', 'every preservation master'],
  ['/', 'the bucket root'],
  ['photos/campo-078-AbC/deep', 'more than one path segment'],
  ['photos/campo-078-AbC-960.avif', 'a full key, not a prefix'],
  ['other/campo-078-AbC', 'a prefix outside the derivative space'],
  ['../photos/campo-078-AbC', 'a traversal attempt'],
]

async function answers(key: string): Promise<boolean> {
  const response = await fetch(publicUrl(key), { method: 'HEAD', cache: 'no-store' })
  return response.status === 200
}

/** Every rendition the naming contract says this set should hold, as full keys. */
function expectedKeys(prefix: string, widths: number[]): string[] {
  return widths.flatMap((w) => FORMATS.map((f) => keyFor(prefix, w, f)))
}

/** Nothing this run made may outlive it -- see the assertion at the foot of `main`. */
async function sweep(): Promise<string[]> {
  let left = await listKeys(`photos/${SLUG}-`)
  for (let tries = 0; left.length && tries < 5; tries++) {
    // A listing is not always current the instant a delete returns.
    await new Promise((wait) => setTimeout(wait, 400))
    await removePrefix(`photos/${SLUG}-`)
    left = await listKeys(`photos/${SLUG}-`)
  }
  return left
}

async function main() {
  // --- 1. the guard, which is the one that protects the other 592 ---
  for (const [prefix, why] of REFUSED) {
    await assert.rejects(
      () => dropDerivatives(prefix),
      /refusing to delete/,
      `dropDerivatives must refuse "${prefix}": it would delete ${why}`,
    )
  }
  // Nothing to delete is the ordinary case -- an unpublished photograph has no
  // keys left -- and it must be a no-op rather than a refusal: a takedown that
  // threw halfway would leave the restoration's derivatives alive behind it.
  assert.equal(await dropDerivatives(null), 0, 'a null prefix deletes nothing')
  assert.equal(await dropDerivatives(undefined), 0, 'an absent prefix deletes nothing')
  assert.equal(await dropDerivatives(''), 0, 'and neither does an empty one')
  assert.equal(await dropRestoredMaster(null), 0, 'a null master key deletes nothing')

  // A master key is a full key, not a prefix, and the two must not be confused.
  await assert.rejects(
    () => dropRestoredMaster('masters/campo-078-AbC'),
    /refusing to delete/,
    'a master key without an extension is not a master key',
  )
  await assert.rejects(
    () => dropRestoredMaster('photos/campo-078-AbC-960.avif'),
    /refusing to delete/,
    'a derivative is not a master',
  )
  console.log(`  ok   ${REFUSED.length + 2} unsafe prefixes refused, 4 empty ones ignored`)

  const leftovers = await listKeys(`photos/${SLUG}-`)
  if (leftovers.length) {
    await removePrefix(`photos/${SLUG}-`)
    console.log(`  ok   cleaned ${leftovers.length} objects from an earlier run`)
  }

  // --- 2. a real round trip per case: generate, confirm, delete, confirm ---
  for (const { width, height, widths } of CASES) {
    const data = await testImage(width, height)
    const made = await generate(SLUG, data)
    assert.ok(made.webKey.startsWith(`photos/${SLUG}-`), 'the prefix carries the slug')
    assert.notEqual(made.webKey, `photos/${SLUG}-`, 'and a random component after it')
    assert.equal(
      made.webWidth,
      widths[widths.length - 1],
      `${width} px yields its widest rendition`,
    )

    const expected = expectedKeys(made.webKey, widths)
    const written = await listKeys(made.webKey)
    assert.deepEqual(
      written.slice().sort(),
      expected.slice().sort(),
      `a ${width} px master writes exactly ${expected.length} renditions, not a fixed six`,
    )
    assert.ok(written.includes(made.thumbKey), 'the stored thumbnail key is one of them')

    // The promise the takedown makes is about URLs, so every one is checked as a URL.
    const live = await Promise.all(expected.map(answers))
    assert.ok(
      live.every(Boolean),
      `every one of the ${expected.length} renditions answers before the takedown`,
    )

    const removed = await dropDerivatives(made.webKey)
    assert.equal(removed, expected.length, 'the delete reports every object it removed')
    assert.equal((await listKeys(made.webKey)).length, 0, 'nothing is left under the prefix')
    assert.equal(await exists(made.thumbKey), false, 'the thumbnail is gone from the bucket')

    const dead = await Promise.all(expected.map(answers))
    assert.ok(
      dead.every((ok) => !ok),
      'and not one of them answers afterwards, which is the takedown',
    )

    // --- 3. republishing: a new prefix, a complete set, the old one still dead ---
    const again = await generate(SLUG, data)
    assert.notEqual(again.webKey, made.webKey, 'republishing draws a new random prefix')
    assert.deepEqual(
      (await listKeys(again.webKey)).slice().sort(),
      expectedKeys(again.webKey, widths).slice().sort(),
      'and regenerates the whole set',
    )
    assert.ok(
      (await Promise.all(expected.map(answers))).every((ok) => !ok),
      'while the addresses the takedown killed stay dead',
    )
    await dropDerivatives(again.webKey)

    console.log(
      `  ok   ${width} px master: ${expected.length} renditions written, served, deleted, ` +
        'unreachable and regenerated under a new prefix',
    )
  }

  /**
   * `db:seed:verify` asserts that every object in the bucket is reachable from a
   * row, and these are reachable from none -- a run that left one behind would
   * turn that tool red for a reason that has nothing to do with the archive.
   */
  assert.deepEqual(await sweep(), [], 'the run leaves nothing of its own in the bucket')

  console.log('\ntakedown smoke ok')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  // In `finally`, because the runs that need cleaning up are exactly the ones that
  // failed: an assertion that fires mid-round leaves everything written so far.
  .finally(async () => {
    const left = await sweep().catch(() => ['(the bucket could not be listed)'])
    if (left.length) console.error(`  MAL left behind in R2: ${left.join(', ')}`)
  })
