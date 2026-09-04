import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { PhotoImage } from '@/components/photo-image'
import { PlayBadge } from '@/components/play-badge'
import { listVideos } from '@/db/queries/gallery'
import { alternatesFor, isLocale, localeHref, type Locale } from '@/i18n/config'
import { photoImageLabels } from '@/i18n/labels'
import type { PhotoImageLabels } from '@/components/photo-image'
import type { Video } from '@/db/queries/gallery'

/**
 * The Videoteca: the interviews with neighbours, listed.
 *
 * A section of its own rather than three players at the foot of three galleries,
 * which is where the old Google Sites left them -- and which is the same failure
 * the whole archive was moved for: nothing had an address of its own. Each one
 * here has `/videoteca/<slug>`.
 *
 * **No pagination.** `PER_PAGE` is 24 and there are three. `Pagination` in
 * `photo-wall.tsx` takes an `href` builder and is ready when there are 25.
 */
export const dynamicParams = true

/**
 * 16:9, which is what a poster already is by the time it reaches R2: the
 * letterbox YouTube pads `hqdefault` with is cropped off when the video is added,
 * so this ratio fits the stored image exactly and nothing is cut here. See
 * `frame()` in `admin/videos/actions.ts` for why that crop is YouTube's own
 * geometry rather than a guess.
 */
const CARD_RATIO = '16 / 9'
const CARD_SIZES = '(min-width: 1000px) 400px, (min-width: 640px) 50vw, 100vw'

export async function generateMetadata(props: PageProps<'/[locale]/videoteca'>): Promise<Metadata> {
  const { locale } = await props.params
  if (!isLocale(locale)) return {}
  const t = await getTranslations({ locale, namespace: 'videoteca' })
  return {
    title: t('title'),
    description: t('description'),
    alternates: alternatesFor(locale, '/videoteca'),
  }
}

export default async function Videoteca(props: PageProps<'/[locale]/videoteca'>) {
  const { locale: asked } = await props.params
  if (!isLocale(asked)) notFound()
  const locale: Locale = asked

  const [videos, t, labels] = await Promise.all([
    listVideos(locale),
    getTranslations({ locale, namespace: 'videoteca' }),
    photoImageLabels(locale),
  ])

  return (
    <>
      <Link
        href={localeHref(locale, '/#secciones')}
        className="t-credit link text-muted hover:text-text focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        ← {t('index')}
      </Link>

      <header className="mt-5">
        <h1 className="t-section">{t('title')}</h1>
        <p className="t-meta mt-4 uppercase">{t('interviews', { count: videos.length })}</p>
        <p className="t-intro text-muted mt-6">{t('description')}</p>
      </header>

      <ul className="mt-10 grid gap-8 sm:mt-14 sm:grid-cols-2 sm:gap-10">
        {videos.map((video, index) => (
          <li key={video.slug}>
            <VideoCard video={video} locale={locale} labels={labels} priority={index < 2} />
          </li>
        ))}
      </ul>
    </>
  )
}

/**
 * A poster in a mount, like a print, and no player: the list links to the ficha
 * and the ficha is where anything of Google's can be asked for. So this page
 * costs a reader exactly the images it shows.
 */
function VideoCard({
  video,
  locale,
  labels,
  priority,
}: {
  video: Video
  locale: Locale
  labels: PhotoImageLabels
  priority: boolean
}) {
  return (
    <Link
      href={localeHref(locale, `/videoteca/${video.slug}`)}
      className="group focus-visible:outline-focus block focus-visible:outline-2 focus-visible:outline-offset-4"
    >
      <div className="mount mount-cover relative">
        <PhotoImage
          photo={video.poster}
          sizes={CARD_SIZES}
          labels={labels}
          ratio={CARD_RATIO}
          priority={priority}
        />
        <PlayBadge size={52} />
      </div>
      <div className="plate mt-3 pt-2.5">
        <h2 className="t-caption-grid link group-hover:text-accent">{video.title}</h2>
      </div>
    </Link>
  )
}
