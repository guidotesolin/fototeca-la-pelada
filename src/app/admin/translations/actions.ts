'use server'

import { redirect } from 'next/navigation'
import { db } from '@/db'
import { defaultLocale, isLocale, type Locale } from '@/i18n/config'
import { requireAdmin } from '@/lib/auth'
import { isSectionSlug } from '@/lib/slug'
import { Invalid, outcome } from '../write'
import { DEFAULT_FILTER, QUEUE_FILTERS, readTranslations } from './items'
import { writeTranslations } from './save'

/**
 * The queue's own action. The other three screens save their translations with
 * their existing button, so this is the only one that needs a redirect of its
 * own -- back to the same page of the same filter, which is what makes 559 pieces
 * something you can do in sittings.
 *
 * **Not one string from the form reaches `redirect()`.** T13 shipped an open
 * redirect built exactly that way: a same-origin `Referer` whose pathname began
 * with `//` made `new URL(path, origin)` resolve a new origin, and the language
 * switch answered `Location: http://evil.example/`. So every part of the address
 * below is validated on its own and the path is built here from the pieces.
 */
export async function saveTranslations(form: FormData) {
  await requireAdmin()

  const raw = form.get('idioma')
  if (!isLocale(raw) || raw === defaultLocale) redirect('/admin/translations?error=idioma')
  const locale: Locale = raw

  const result = await outcome('translations', 'traducciones', async () => {
    const entries = readTranslations(form)
    // Every box on this screen belongs to the language the screen is for. A form
    // that says otherwise was not drawn by this page.
    if (entries.some((e) => e.target.locale !== locale)) throw new Invalid('idioma')
    await db.transaction((tx) => writeTranslations(tx, entries))
  })

  redirect(`/admin/translations/${locale}?${queueQuery(form)}&${result}`)
}

/** The filter the queue was showing, rebuilt from a closed set of legal values. */
function queueQuery(form: FormData): string {
  const params = new URLSearchParams()

  const que = form.get('que')
  params.set('que', typeof que === 'string' && que in QUEUE_FILTERS ? que : DEFAULT_FILTER)

  const seccion = form.get('seccion')
  if (isSectionSlug(seccion)) params.set('seccion', seccion)

  const page = form.get('p')
  if (typeof page === 'string' && /^\d{1,4}$/.test(page) && Number(page) > 1) {
    params.set('p', page)
  }

  if (form.get('ya') !== null) params.set('ya', '1')

  return params.toString()
}
