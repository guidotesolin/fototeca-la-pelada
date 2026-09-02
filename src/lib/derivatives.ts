import { derive } from './images'
import { keyFor } from './photo'
import { newPrefix, put, removePrefix } from './r2'
import type { Master } from './images'

/**
 * The two halves of a takedown, and of undoing one.
 *
 * Unpublishing deletes the derivatives from R2, because removing a photograph
 * from the listings while its file still answers at its URL would make the
 * takedown a lie. It never touches a master: the master is the document, the
 * derivatives are regenerable, and republishing is `getBytes(master)` through
 * `derive()` again. That holds for the restoration's master too -- deleting it
 * would turn a takedown into the destruction of somebody's retouching work.
 *
 * Every generation draws a fresh random prefix, so the URLs a takedown killed
 * never come back to life: republishing publishes new addresses.
 */

export type Derivatives = {
  /** The prefix, which is what `web_key` holds -- `keyFor()` completes it per width. */
  webKey: string
  webWidth: number
  webHeight: number
  /** A full key, unlike `webKey`: the narrowest WebP rendition. */
  thumbKey: string
}

/**
 * What a single photograph's derivatives look like in R2: one path segment under
 * `photos/`, a slug and a random suffix, and nothing else. The guard is here
 * because `removePrefix` deletes everything below what it is given, so a prefix
 * computed wrong -- `photos/`, or an empty string, which lists the whole bucket --
 * would take the entire archive's derivatives with it. Refusing loudly is the
 * only acceptable failure mode for a delete that broad.
 */
const DERIVATIVE_PREFIX = /^photos\/[A-Za-z0-9_-]+$/

/** A master's key is a full object key, not a prefix: one segment plus an extension. */
const MASTER_KEY = /^masters\/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/

/** Encodes the renditions, uploads them, and reports the keys a row should store. */
export async function generate(
  slug: string,
  data: Buffer,
): Promise<Derivatives & { master: Master }> {
  const prefix = newPrefix('photos', slug)
  const { renditions, master } = await derive(data)
  try {
    await Promise.all(
      renditions.map((r) => put(keyFor(prefix, r.width, r.format), r.data, r.format)),
    )
  } catch (error) {
    // One failed upload out of six leaves the other five in the bucket under a
    // prefix no row will ever name, which is the orphan `db:seed:verify` refuses
    // to tolerate. Nothing has been recorded yet, so it can all go.
    await removePrefix(prefix)
    throw error
  }
  // The same rule the seed writes rows under: the largest rendition is what the
  // page is sized from, the narrowest WebP is the thumbnail every browser reads.
  const largest = renditions.reduce((a, b) => (a.width >= b.width ? a : b))
  const narrowest = Math.min(...renditions.map((r) => r.width))
  return {
    webKey: prefix,
    webWidth: largest.width,
    webHeight: largest.height,
    thumbKey: keyFor(prefix, narrowest, 'webp'),
    master,
  }
}

/**
 * Deletes one photograph's derivatives. The count comes back so a caller can say
 * how many files a takedown actually removed rather than assuming it worked.
 */
export async function dropDerivatives(prefix: string | null | undefined): Promise<number> {
  if (!prefix) return 0
  if (!DERIVATIVE_PREFIX.test(prefix)) {
    throw new Error(`refusing to delete under "${prefix}": not one photograph's derivative prefix`)
  }
  return removePrefix(prefix)
}

/**
 * Deletes a restoration's master, which is the one master that is ever deleted:
 * when the restoration itself is removed or replaced, its master stops being the
 * document of anything. The photograph's own master has no path to this function.
 */
export async function dropRestoredMaster(key: string | null | undefined): Promise<number> {
  if (!key) return 0
  if (!MASTER_KEY.test(key)) {
    throw new Error(`refusing to delete under "${key}": not a master's key`)
  }
  return removePrefix(key)
}
