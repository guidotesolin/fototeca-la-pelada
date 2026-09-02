import 'server-only'
import { revalidateTag } from 'next/cache'
import { TAKEDOWN_TAG } from '@/db/queries/admin'
import { GALLERY_TAG } from '@/db/queries/gallery'

/**
 * What every write in the panel has in common: it either works or it does not,
 * and either way the screen finds out through the query string -- which is what
 * makes the whole panel work with JavaScript off, since a form post answers 303
 * and the next page renders the outcome.
 *
 * **Revalidation lives here rather than in each action, so no write can forget
 * it**, and both profiles are T10's, measured rather than reasoned about:
 *
 * - `GALLERY_TAG` gets `'max'`. The public pages are prerendered, so the
 *   prerendered copy is the only copy: `{ expire: 0 }` throws it away and leaves
 *   nothing to regenerate it from, and `next start` then answers **404 for every
 *   photograph and every gallery** with `NoFallbackError` until the process is
 *   restarted. `'max'` never misses -- it serves the old page while the new one
 *   renders behind it.
 * - `TAKEDOWN_TAG` gets `{ expire: 0 }`, because stale is the one thing a
 *   takedown cannot be: with `'max'` the first read of `/api/gone` after
 *   unpublishing still came back empty, so the page answered 404 instead of 410.
 *   It is a route handler and regenerates on demand, so expiring it costs one
 *   query and risks nothing. Every write asks for it rather than only the ones
 *   that can change what is published, which is T10's own reason for putting
 *   revalidation here: a write that has to remember is a write that can forget.
 */

/** A message code from `./ui`, thrown where the mistake is found. */
export class Invalid extends Error {}

export async function outcome(
  /** For the log line, so a failure says which screen it came from. */
  scope: string,
  done: string,
  work: () => Promise<void>,
): Promise<string> {
  try {
    await work()
  } catch (error) {
    if (error instanceof Invalid) return `error=${error.message}`
    console.error(`[admin/${scope}] the write failed:`, error)
    return 'error=interno'
  }
  revalidateTag(GALLERY_TAG, 'max')
  revalidateTag(TAKEDOWN_TAG, { expire: 0 })
  return `ok=${done}`
}
