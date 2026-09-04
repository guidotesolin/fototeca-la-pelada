import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { PhotoImage } from '@/components/photo-image'
import { VideoFacade } from '@/components/video-facade'
import { getVideo, listVideoSlugs, listVideos } from '@/db/queries/gallery'
import { keyFor, publicUrl } from '@/lib/photo'
import { videoWatchUrl } from '@/lib/url'
import { alternatesFor, isLocale, localeHref, type Locale } from '@/i18n/config'
import { photoImageLabels } from '@/i18n/labels'

/**
 * One interview, with an address of its own.
 *
 * The point of the page, and the reason the Videoteca is a section rather than
 * three players at the foot of three galleries: this is the link that travels
 * through the town's WhatsApp, and it carries an Open Graph card built from the
 * archive's own poster.
 */
export const dynamicParams = true

const CONTENT_WIDTH = 1248

/**
 * Every slug in every language, which is twelve pages for three interviews.
 *
 * The photo page's `generateStaticParams` splits by locale because 592 × 4 is
 * 2,368 pages; three of anything is not worth the asymmetry. It also avoids the
 * trap that section records and measured: returning `[]` for a non-default locale
 * makes Next 16.3.3 discard the static params of the segment **entirely**,
 * Spanish included. Every locale coming back with the whole list cannot hit it.
 */
export async function generateStaticParams() {
  return (await listVideoSlugs()).map((slug) => ({ slug }))
}

export async function generateMetadata(
  props: PageProps<'/[locale]/videoteca/[slug]'>,
): Promise<Metadata> {
  const { locale, slug } = await props.params
  if (!isLocale(locale)) return {}
  const [video, t] = await Promise.all([
    getVideo(locale, slug),
    getTranslations({ locale, namespace: 'videoteca' }),
  ])
  if (!video) return {}

  const description = video.description ?? t('description')

  return {
    title: video.title,
    description,
    alternates: alternatesFor(locale, `/videoteca/${slug}`),
    openGraph: {
      // A page's `openGraph` replaces the layout's rather than merging into it,
      // so the image has to be named here or the card goes out without one.
      title: video.title,
      description,
      locale,
      type: 'video.other',
      images: [
        {
          // WebP and not AVIF, for the reason `/foto/[slug]` already records: the
          // scrapers do not read AVIF. This is what the poster in R2 buys -- an
          // `i.ytimg.com` address would be a third-party host in `img-src`.
          url: publicUrl(keyFor(video.poster.webKey, video.poster.webWidth, 'webp')),
          width: video.poster.webWidth,
          height: video.poster.webHeight,
          alt: video.title,
        },
      ],
    },
  }
}

export default async function VideoPage(props: PageProps<'/[locale]/videoteca/[slug]'>) {
  const { locale: asked, slug } = await props.params
  if (!isLocale(asked)) notFound()
  const locale: Locale = asked

  const [video, all, t, labels] = await Promise.all([
    getVideo(locale, slug),
    listVideos(locale),
    getTranslations({ locale, namespace: 'videoteca' }),
    photoImageLabels(locale),
  ])
  if (!video) notFound()

  const at = all.findIndex((v) => v.slug === video.slug)
  const previous = at > 0 ? all[at - 1] : null
  const next = at >= 0 && at < all.length - 1 ? all[at + 1] : null

  const width = Math.min(video.poster.webWidth, CONTENT_WIDTH)

  return (
    <article>
      <Link
        href={localeHref(locale, '/videoteca')}
        className="t-credit link text-muted hover:text-text focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        ← {t('title')}
      </Link>

      <h1 className="t-section mt-5">{video.title}</h1>

      {/* The frame's ratio is declared, so the box is reserved before anything
          arrives and nothing moves when the player replaces the poster. Same
          reason the home page reserves the map's. */}
      <div className="mount mt-8">
        <div className="print relative" style={{ aspectRatio: '16 / 9' }}>
          <VideoFacade youtubeId={video.youtubeId} title={video.title} play={t('play')}>
            {/* `fill`, so the frame above sets the box. The poster is stored at
                16:9 already, so this is a fit rather than a crop. */}
            <PhotoImage
              photo={video.poster}
              sizes={`(min-width: ${width}px) ${width}px, 100vw`}
              labels={labels}
              priority
              fill
            />
          </VideoFacade>
        </div>
      </div>

      {video.description && (
        <div className="t-caption-photo mt-8">
          {video.description.split('\n\n').map((paragraph, index) => (
            <p key={index} className="mt-4 first:mt-0">
              {paragraph}
            </p>
          ))}
        </div>
      )}

      {/* A plain anchor out, always present and never behind script: the facade's
          own link disappears the moment the player takes its place, and somebody
          may still want the interview on YouTube itself. */}
      <p className="t-credit mt-6">
        <a
          href={videoWatchUrl(video.youtubeId)}
          rel="noopener"
          className="link hover:text-text focus-visible:outline-focus underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {t('watchOnYoutube')} ↗
        </a>
      </p>

      {(previous || next) && (
        <nav className="border-rule mt-14 flex justify-between gap-6 border-t pt-5">
          <Step video={previous} locale={locale} label={`← ${t('previous')}`} align="text-left" />
          <Step video={next} locale={locale} label={`${t('next')} →`} align="text-right" />
        </nav>
      )}
    </article>
  )
}

function Step({
  video,
  locale,
  label,
  align,
}: {
  video: { slug: string; title: string } | null
  locale: Locale
  label: string
  align: string
}) {
  if (!video) return <span />
  return (
    <Link
      href={localeHref(locale, `/videoteca/${video.slug}`)}
      className={`t-credit link hover:text-text focus-visible:outline-focus max-w-[46%] focus-visible:outline-2 focus-visible:outline-offset-2 ${align}`}
    >
      <span className="t-label block">{label}</span>
      <span className="mt-1 block">{video.title}</span>
    </Link>
  )
}
