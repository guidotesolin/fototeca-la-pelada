'use server'

import { eq, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import sharp from 'sharp'
import { db } from '@/db'
import { SOURCE_LOCALE } from '@/db/queries/gallery'
import { nextVideoSlug } from '@/db/queries/admin'
import { video, videoTranslation } from '@/db/schema'
import { requireAdmin } from '@/lib/auth'
import { dropDerivatives, generate } from '@/lib/derivatives'
import { read } from '@/lib/images'
import { isYoutubeId } from '@/lib/url'
import { readTranslations } from '../translations/items'
import { writeTranslations } from '../translations/save'
import { Invalid, outcome } from '../write'

/**
 * Every write the Videoteca screens make. The rules are T10's and T11's, and the
 * revalidation they share lives in `../write`:
 *
 * - **`requireAdmin()` first, always.** A server action is a POST endpoint with a
 *   public URL, so hiding the button that calls it hides nothing.
 * - **Everything from the form is validated on the server.**
 *
 * The one decision that belongs here rather than in the markup: **an id is stored
 * and a URL never is.** The embed address is built by `videoEmbedUrl`, so no value
 * an administrator can type reaches the `<iframe src>` as an address -- eleven
 * characters of base64url reach it as a path segment. That is a stronger promise
 * than accepting a URL and sanitising it, and it is why `isYoutubeId` is the whole
 * of the check.
 */

/** Longest we accept per kind of field, mirroring the sections'. */
const LIMITS = { title: 120, description: 4000 }

function line(form: FormData, name: string, max: number): string | null {
  const raw = form.get(name)
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value) return null
  if (value.length > max) throw new Invalid('largo')
  return value
}

/** The interview an action works on, read by slug. The form never names a row id. */
async function load(slug: string) {
  const [row] = await db.select().from(video).where(eq(video.slug, slug)).limit(1)
  if (!row) throw new Invalid('video-no-existe')
  return row
}

const SLUG = /^[a-z0-9-]{1,64}$/

/**
 * The poster, downloaded once, here and never in the browser.
 *
 * **This is the whole reason the Videoteca costs a reader nothing until they press
 * play.** YouTube serves posters from `i.ytimg.com`; hotlinking one would put a
 * third-party host into `img-src`, which is a real header in production, and would
 * have every visit to the list announce itself to Google. Fetching it once from a
 * server action instead means the bytes end up in R2 under a key of the archive's
 * own, and `img-src` is not touched.
 *
 * `maxresdefault` first because it is 1280 px and yields the whole 480/960/1280
 * ladder; `hqdefault` is the fallback and always exists, at 480×360, which
 * `derive` turns into a single width since nothing is ever upscaled.
 */
const POSTER_SIZES = ['maxresdefault', 'hqdefault'] as const

/**
 * The frame, without the letterbox YouTube pads it with.
 *
 * `hqdefault` is always 480x360 -- 4:3 -- and a 16:9 video is padded into it with
 * a black bar of `(360 - 480 * 9/16) / 2 = 45px` top and bottom. Left alone, the
 * home page draws that poster in a 4:3 card beside eleven photographs and it is
 * the only one on the page with black bars: it reads as a broken image. Seen on
 * the running build rather than reasoned about.
 *
 * **The crop is YouTube's own geometry, not an estimate.** Its central 16:9 region
 * is exactly the frame YouTube itself publishes as `mqdefault`: measured against
 * the archive's three, the two agree to a mean of 4-7 of 255 per pixel, which is
 * the difference between two JPEG encodes of one image. So whatever aspect the
 * video was shot in, this is the framing YouTube chose for it.
 *
 * `sharp.trim()` was the other candidate and was rejected: it needs a threshold,
 * and on these three it landed at ratios of 1.69 to 1.75 depending on the number
 * picked. A tuned constant with a fuzzy result is what T6's packed wall already
 * taught this repository to distrust.
 *
 * There is no branch for the 16:9 sources, because there does not need to be one:
 * for `maxresdefault` at 1280x720 the same arithmetic gives `top = 0` and the full
 * height, so the crop is the identity.
 */
async function frame(data: Buffer): Promise<Buffer> {
  const { width, height } = await sharp(data).metadata()
  if (!width || !height) throw new Invalid('poster')
  const wanted = Math.round((width * 9) / 16)
  if (wanted >= height) return data
  return sharp(data)
    .extract({ left: 0, top: Math.round((height - wanted) / 2), width, height: wanted })
    .toBuffer()
}

async function posterBytes(youtubeId: string): Promise<Buffer> {
  for (const size of POSTER_SIZES) {
    const response = await fetch(`https://i.ytimg.com/vi/${youtubeId}/${size}.jpg`, {
      cache: 'no-store',
    })
    // A missing `maxresdefault` is a 404, and YouTube also answers 200 with a
    // grey placeholder for an id that does not exist -- which `read()` below
    // accepts as an image, so the id check upstream is what actually stops that.
    if (response.ok) return frame(Buffer.from(await response.arrayBuffer()))
  }
  throw new Invalid('poster')
}

/**
 * A new interview: the id, its Spanish title, and the poster.
 *
 * R2 first and the row second, with the rollback covering both, which is the shape
 * `admin/import/actions.ts` already uses: a failed insert must not leave renditions
 * in the bucket under a prefix no row will ever name.
 *
 * It arrives published, like an imported photograph and for the same reason --
 * adding it is how you see that it worked. **Despublicar** is one click if it
 * should wait.
 */
export async function createVideo(form: FormData) {
  await requireAdmin()

  let slug = ''
  const result = await outcome('videos', 'video-creado', async () => {
    const youtubeId = form.get('youtubeId')
    if (!isYoutubeId(youtubeId)) throw new Invalid('id-youtube')

    const title = line(form, 'title', LIMITS.title)
    if (!title) throw new Invalid('titulo')
    const description = line(form, 'description', LIMITS.description)

    // A read before a write is a race and not a promise -- there is no unique
    // index on `youtube_id`, deliberately, since the same interview could one day
    // be listed twice on purpose. This is here so the screen can say so rather
    // than silently making a duplicate.
    const [existing] = await db
      .select({ slug: video.slug })
      .from(video)
      .where(eq(video.youtubeId, youtubeId))
      .limit(1)
    if (existing) throw new Invalid('id-repetido')

    slug = await nextVideoSlug()
    const data = await posterBytes(youtubeId)
    // The real type comes from the bytes. What YouTube said it was sending is not
    // a check, the same rule the Drive import applies to a shared folder.
    await read(data)

    let made: Awaited<ReturnType<typeof generate>> | null = null
    try {
      const poster = (made = await generate(slug, data))
      const [{ next }] = await db
        .select({ next: sql<number>`coalesce(max(${video.position}), 0) + 1` })
        .from(video)

      await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(video)
          .values({
            slug,
            youtubeId,
            position: next,
            published: true,
            webKey: poster.webKey,
            webWidth: poster.webWidth,
            webHeight: poster.webHeight,
            thumbKey: poster.thumbKey,
          })
          .returning({ id: video.id })
        // The Spanish row in the same transaction, so `video` and its source
        // translation are never one without the other -- which is what lets every
        // public read join it as an inner join.
        await tx
          .insert(videoTranslation)
          .values({ videoId: row.id, locale: SOURCE_LOCALE, title, description })
      })
    } catch (error) {
      await dropDerivatives(made?.webKey)
      throw error
    }
  })

  redirect(slug ? `/admin/videos/${slug}?${result}` : `/admin/videos?${result}`)
}

/**
 * The Spanish, the order, and the three languages, behind one Guardar.
 *
 * The translation boxes are inside this form and this transaction on purpose:
 * the gesture the editor was built for is write the Spanish, paste three
 * translations, press the button once. A second form below the first would mean
 * pressing the lower button and losing the Spanish sitting unsent in the upper
 * one. See T15's note in ARCHITECTURE.
 */
export async function saveVideo(form: FormData) {
  await requireAdmin()
  const slug = form.get('slug')
  if (typeof slug !== 'string' || !SLUG.test(slug)) redirect('/admin/videos?error=video-no-existe')

  const result = await outcome('videos', 'video-guardado', async () => {
    const row = await load(slug)

    const title = line(form, 'title', LIMITS.title)
    if (!title) throw new Invalid('titulo')
    const description = line(form, 'description', LIMITS.description)

    const rawPosition = form.get('position')
    if (typeof rawPosition !== 'string' || !/^\d{1,6}$/.test(rawPosition))
      throw new Invalid('orden')

    const translations = readTranslations(form)

    await db.transaction(async (tx) => {
      await tx
        .update(video)
        .set({ position: Number(rawPosition) })
        .where(eq(video.id, row.id))
      await tx
        .insert(videoTranslation)
        .values({ videoId: row.id, locale: SOURCE_LOCALE, title, description })
        .onConflictDoUpdate({
          target: [videoTranslation.videoId, videoTranslation.locale],
          set: { title, description },
        })
      await writeTranslations(tx, translations)
    })
  })

  redirect(`/admin/videos/${slug}?${result}`)
}

/**
 * On the site or off it. Its own one-button form and not a checkbox on the form
 * above, because publishing is not a field: hiding an interview makes its page
 * answer 410 through the proxy and takes it out of the sitemap, and the screen
 * says so beside the button.
 *
 * Nothing is deleted. The poster stays in R2 under the key the row still names,
 * which is what makes publishing again one boolean -- the same amendment the
 * photographs got.
 */
export async function setVideoPublished(form: FormData) {
  await requireAdmin()
  const slug = form.get('slug')
  if (typeof slug !== 'string' || !SLUG.test(slug)) redirect('/admin/videos?error=video-no-existe')
  const publishing = form.get('published') === 'true'

  const result = await outcome(
    'videos',
    publishing ? 'video-publicado' : 'video-despublicado',
    async () => {
      const row = await load(slug)
      await db.update(video).set({ published: publishing }).where(eq(video.id, row.id))
    },
  )

  redirect(`/admin/videos/${slug}?${result}`)
}
