import { getTranslations } from 'next-intl/server'
import type { Locale } from './config'
import type { PhotoImageLabels } from '@/components/photo-image'

/**
 * The strings a component that cannot read them itself needs handed to it.
 *
 * `PhotoImage` is the only such component, and not by choice: the section deck is
 * Swiper and therefore a client component, and it imports `PhotoImage`, which
 * puts that module in the client bundle. So its three strings are translated here
 * and passed down, which is the same shape `SensitiveSwitch` and `SectionDeck`
 * already use for theirs — and it is what keeps every message file out of the
 * browser.
 *
 * One helper rather than three `t()` calls in each of the four callers, because
 * the callers are what got this wrong once already.
 */
export async function photoImageLabels(locale: Locale): Promise<PhotoImageLabels> {
  const t = await getTranslations({ locale, namespace: 'photo' })
  return {
    altNoCaption: t('altNoCaption'),
    warning: t('warning'),
    reveal: t('reveal'),
  }
}
