'use server'

import { and, eq, inArray, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { SOURCE_LOCALE } from '@/db/queries/gallery'
import { siteText } from '@/db/schema'
import { requireAdmin } from '@/lib/auth'
import { externalUrl } from '@/lib/url'
import { Invalid, outcome } from '../write'
import { EMAIL, LIMITS, SITE_TEXT } from './fields'

/**
 * The one write behind the site's own words.
 *
 * **This is the trust boundary the guards in `src/lib/url.ts` were written for.**
 * Three of these fields end up in an `href` and they are typed by a person: an
 * administrator is trusted with the archive, which is not the same as being
 * trusted to have pasted a URL a naive parser reads the way it looks. So a value
 * is put through `externalUrl` **before it is stored**, and what is stored is the
 * guard's own normalised output -- not the typed string. The public side runs the
 * same guards again on the way out, which is not redundant: the rows predate this
 * screen and a database is not only written by this form.
 *
 * `requireAdmin()` first, as in every action under `/admin`: a server action is a
 * POST endpoint with a public URL of its own.
 */

/** Empty means "take it off the site", so the row goes rather than becoming ''. */
function clean(form: FormData, key: string, kind: keyof typeof LIMITS): string | null {
  const raw = form.get(key)
  if (typeof raw !== 'string') return null
  // A textarea posts CRLF; every consumer of these values splits on \n\n.
  const value = raw.replace(/\r\n/g, '\n').trim()
  if (!value) return null
  if (value.length > LIMITS[kind]) throw new Invalid('largo')

  switch (kind) {
    case 'link': {
      const url = externalUrl(value)
      if (!url) throw new Invalid('url-red')
      return url
    }
    case 'email':
      if (!EMAIL.test(value)) throw new Invalid('email')
      return value
    default:
      return value
  }
}

export async function saveSiteText(form: FormData) {
  await requireAdmin()

  const result = await outcome('site-text', 'textos', async () => {
    // Everything is validated before anything is written: a rejected social URL
    // must not leave the other ten fields saved and the screen reporting a failure.
    const values = SITE_TEXT.map(
      (field) => [field.key, clean(form, field.key, field.kind)] as const,
    )
    const present = values.flatMap(([key, value]) =>
      value === null ? [] : [{ key, locale: SOURCE_LOCALE, value }],
    )
    const absent = values.flatMap(([key, value]) => (value === null ? [key] : []))

    await db.transaction(async (tx) => {
      if (present.length) {
        await tx
          .insert(siteText)
          .values(present)
          // `excluded.value` is the row this insert would have written, so the
          // eleven keys are one statement instead of eleven round trips.
          .onConflictDoUpdate({
            target: [siteText.key, siteText.locale],
            set: { value: sql`excluded.value` },
          })
      }
      // A field they cleared is a row that goes, not a row that becomes '': the
      // pages test these values for truthiness to decide whether to render at all.
      if (absent.length) {
        await tx
          .delete(siteText)
          .where(and(eq(siteText.locale, SOURCE_LOCALE), inArray(siteText.key, absent)))
      }
    })
  })
  redirect(`/admin/site-text?${result}`)
}
