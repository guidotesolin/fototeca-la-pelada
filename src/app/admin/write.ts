import 'server-only'
import { revalidateTag } from 'next/cache'
import { TAKEDOWN_TAG } from '@/db/queries/admin'
import { GALLERY_TAG } from '@/db/queries/gallery'
import { currentAdmin } from '@/lib/auth'
import { overLimit } from '@/lib/rate-limit'

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
 *
 * **The rate limit is here for that same reason**, and it is the panel's half of
 * what _Security_ asks for (F31). Every write in the panel comes through this
 * function, so one guard covers all ten actions and no future one can be added
 * without it -- which is not true of a check copied into each action.
 *
 * It is counted per administrator and not per address: these endpoints are behind
 * `requireAdmin()`, so by the time anything reaches here there is a name to charge
 * it to, and it is a better key than an address two brothers may share. The
 * lookup is free -- `currentAdmin` is memoised per request and the action above
 * has already called it.
 *
 * What it is actually protecting is Neon's free tier, R2 and Drive's quota
 * against a loop rather than against an attacker: the allowlist is two people,
 * and the panel's own import screen is a client that submits itself once per
 * render.
 */

/** A message code from `./ui`, thrown where the mistake is found. */
export class Invalid extends Error {}

/**
 * Writes one administrator may make in a minute.
 *
 * Sixty, set by the only thing in the panel that writes in a loop: the Drive
 * import, which brings one photograph per request at a master download plus six
 * encodes plus six uploads each. That is seconds per write, so a folder running
 * flat out lands nearer twenty a minute and never touches this. Anything that
 * does reach sixty is not a person.
 */
const WRITE_LIMIT = 60
const WRITE_WINDOW_MS = 60_000

export async function outcome(
  /** For the log line, so a failure says which screen it came from. */
  scope: string,
  done: string,
  work: () => Promise<void>,
): Promise<string> {
  const admin = await currentAdmin()
  // No admin means the action's own `requireAdmin()` is about to redirect anyway;
  // counting it under one shared key stops that path from being a free bucket.
  if (overLimit(`w:${admin?.id ?? 'anon'}`, WRITE_LIMIT, WRITE_WINDOW_MS)) {
    console.warn(`[admin/${scope}] rate limited`)
    return 'error=demasiado-rapido'
  }

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
