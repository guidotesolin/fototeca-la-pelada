/**
 * A fixed-window counter, in memory, for the two places _Security_ asks for one:
 * `/buscar` and the panel's writes. F31 is what this closes.
 *
 * **It counts per instance, and that is the whole of the ceiling.** Serverless
 * runs as many copies as it likes, so a limit of N is really N per instance and a
 * flood spread across cold starts is barely slowed. The way out is a shared
 * counter -- Vercel KV, Upstash, anything with an atomic increment -- and the
 * reason it is not here is that a KV store is a dependency, an account and a
 * variable to lose for a public archive whose search reaches a query cache before
 * it reaches Neon. What this buys is the case it was asked for: one client, one
 * loop, thousands of distinct queries. That one is stopped by a `Map`.
 *
 * ponytail: per-instance fixed window. Move to a shared store the day the archive
 * is worth attacking properly, or the day Vercel's own rate limiting is on the
 * free tier -- both are a swap of this file, since nothing else knows how the
 * counting is done.
 */

type Window = { count: number; until: number }

const windows = new Map<string, Window>()

/**
 * How many distinct clients we are willing to remember. A rate limiter that grows
 * a `Map` without bound is a better denial of service than the one it prevents:
 * a flood from ten thousand addresses would be counted right up until the
 * instance ran out of memory.
 */
const MAX_KEYS = 10_000

/**
 * True if this key has already spent its allowance for the current window.
 *
 * Fixed window and not a sliding one: a sliding window needs a timestamp per
 * request, and the failure a fixed window has -- twice the limit across a window
 * boundary -- is not a failure at these numbers.
 */
export function overLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const open = windows.get(key)

  if (!open || open.until <= now) {
    if (windows.size >= MAX_KEYS) {
      for (const [k, w] of windows) if (w.until <= now) windows.delete(k)
      // Still full, so every window in it is live: this is the flood the cap
      // exists for. Forgetting all of them costs the attacker one window and
      // keeps the instance alive, which is the right way round.
      if (windows.size >= MAX_KEYS) windows.clear()
    }
    windows.set(key, { count: 1, until: now + windowMs })
    return false
  }

  open.count += 1
  return open.count > limit
}

/**
 * Who a request is from, for the counter.
 *
 * Next 16 has no API for this -- `NextRequest.ip` was removed in v15, and the
 * docs say the value belongs to the host -- so it is read from the header Vercel
 * sets. **`x-forwarded-for` is only trustworthy behind a proxy that overwrites
 * it**, which Vercel does; run this anywhere that does not and a client picks its
 * own bucket. The falsy answer is deliberately one shared bucket rather than a
 * free pass: an unidentified flood should be counted together, not exempted.
 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || headers.get('x-real-ip') || 'unknown'
}
