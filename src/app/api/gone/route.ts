import { listGoneSlugs } from '@/db/queries/admin'

/**
 * The slugs whose page must answer 410, for the proxy that answers it.
 *
 * It exists because a proxy cannot reach the database on every request without
 * putting Neon back in the request path, which is the one thing this design keeps
 * out of it. The read behind this handler is cached and carries `TAKEDOWN_TAG`,
 * which the panel revalidates with `{ expire: 0 }` on every write, so the list is
 * never stale and an archive nobody has taken anything down from queries Neon for
 * it exactly once. Measured: a cold server reads it from the on-disk data cache
 * without touching Neon at all.
 *
 * Public, and deliberately so: a slug in here is a slug whose own page already
 * answers 410 to anyone who asks, and the archive's slugs are sequential and
 * guessable by design (`campo-078`). This hands out nothing that probing does not,
 * and putting a shared secret in front of it would only add a variable to lose.
 */
export async function GET() {
  return Response.json(await listGoneSlugs(), {
    headers: {
      'X-Robots-Tag': 'noindex',
      // The proxy keeps its own short memo; this stops anything in between from
      // holding a list of takedowns for longer than the panel thinks it did.
      'Cache-Control': 'no-store',
    },
  })
}
