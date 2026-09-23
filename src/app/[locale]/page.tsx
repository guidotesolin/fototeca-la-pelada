import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { SectionDeck } from '@/components/section-deck'
import { MapFacade } from '@/components/map-facade'
import { PhotoImage } from '@/components/photo-image'
import { PhotoWall } from '@/components/photo-wall'
import {
  archiveFacts,
  listRecent,
  listSections,
  listSiteText,
  listVideos,
} from '@/db/queries/gallery'
import { mapEmbedUrl } from '@/lib/url'
import { alternatesFor, isLocale, localeHref, type Locale } from '@/i18n/config'
import { photoImageLabels } from '@/i18n/labels'
import type { PhotoImageLabels } from '@/components/photo-image'
import type { Section } from '@/db/queries/gallery'

/**
 * The archive's index. Not one word of it is written by code: the title and the
 * description are the authors' own, and every section is introduced by the text
 * they wrote for it.
 *
 * On the index a photograph is not the work, it is the signboard, which is why it
 * is cropped: eleven different heights cannot be swept with the eye. Each copy's
 * real proportion returns intact in the gallery and on the photo page. On desktop
 * the signboards are a fan; on a phone the fan does not fit and the 4:3 cards stay.
 */
const CARD_RATIO = '4 / 3'
const CARD_SIZES = '(min-width: 1280px) 288px, (min-width: 640px) 33vw, 50vw'

/** The four hreflangs and this language's canonical. The title and the description
 *  are the root layout's -- the index is the page the site is named after. */
export async function generateMetadata(props: PageProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await props.params
  if (!isLocale(locale)) return {}
  return { alternates: alternatesFor(locale, '/') }
}

export default async function Home(props: PageProps<'/[locale]'>) {
  const { locale: asked } = await props.params
  if (!isLocale(asked)) notFound()
  const locale: Locale = asked

  const [sections, facts, text, recent, videos, t, tv, labels] = await Promise.all([
    listSections(locale),
    archiveFacts(),
    listSiteText(locale),
    listRecent(locale),
    listVideos(locale),
    getTranslations({ locale, namespace: 'home' }),
    getTranslations({ locale, namespace: 'videoteca' }),
    photoImageLabels(locale),
  ])
  const mapUrl = mapEmbedUrl(text.map_embed_url)

  return (
    <>
      <section>
        {text.home_title && <h1 className="t-headline mx-auto text-center">{text.home_title}</h1>}

        {/* The deck (Swiper, desktop only): the reference is Europeana. Its own
            aria-label names it, so dropping the heading costs nothing spoken. It
            opens the page, and a phone never sees it — the component returns null
            below 900 px, where `.deck-slot` is flat for the same reason.

            The slot is what makes the deck cost nothing to arrive: it cannot
            decide it has room until it has hydrated, so the space it will take is
            held open by CSS the server already sent. See its note in globals.css. */}
        <div className="deck-slot">
          <SectionDeck sections={sections} locale={locale} label={t('deck')} labels={labels} />
        </div>

        {/* Centred under the centred title: left-aligned it read as an orphan in the
            corner of a symmetric composition. The four figures used to sit below it
            and now live in the footer's "El archivo hasta hoy", so they are not
            repeated here. */}
        {text.home_intro && (
          <p className="t-intro text-muted mx-auto mt-14 text-center sm:mt-16">{text.home_intro}</p>
        )}

        {/* The map beside the town's own description, the way the old home page set
            them, stacking on a phone. Both are the authors' — the coordinates they
            chose and the paragraphs they wrote. */}
        <div className="mt-12 grid gap-8 sm:mt-16 lg:grid-cols-2 lg:items-start lg:gap-12">
          {mapUrl && (
            <div className="mount">
              {/* The ratio is declared so the frame is reserved before the map
                  arrives: an iframe that sizes itself on load is layout shift.
                  Empty until somebody asks for it — `loading="lazy"` was here and
                  did nothing, because Chrome fetches a frame this close to the
                  viewport anyway. See `MapFacade`: it is the decision the
                  Videoteca's player already took, applied to the other embed. */}
              <div className="print relative" style={{ aspectRatio: '4 / 3' }}>
                <MapFacade src={mapUrl} title={t('map')} open={t('showMap')} />
              </div>
            </div>
          )}

          {text.town_intro && (
            <div>
              {text.town_title && (
                <h2 className="t-label border-rule border-b pb-3">{text.town_title}</h2>
              )}
              <div className="t-intro text-muted mt-5">
                {text.town_intro.split('\n\n').map((paragraph, index) => (
                  <p key={index} className="mt-4 first:mt-0">
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="mt-14 sm:mt-20" id="secciones">
        {/* The list, which on a phone is all there is, and on desktop sits below.
            An h2: it is the section's only heading now, and h1 -> h3 would skip. */}
        <h2 className="t-label border-rule mt-6 border-b pb-3 xl:mt-10">
          {t('allSections', { count: facts.photos })}
        </h2>
        <ul className="section-grid mt-6">
          {sections.map((section, index) => (
            <li key={section.slug}>
              <SectionCard section={section} locale={locale} labels={labels} priority={index < 2} />
            </li>
          ))}
          {/* **Always last, and never in the deck.** Last because the eleven are
              ordered from the panel and this one is not a `category` row, so
              anywhere else it would be a card the brothers can see and cannot
              move. Not in the deck for the same reason the heading above says
              "592 fotografías": the deck and that count are both about
              photographs, and a twelfth card holding none would make the sentence
              untrue. It carries interviews instead, and says so. */}
          {videos.length > 0 && videos[0] && (
            <li>
              <SectionCard
                section={{
                  slug: 'videoteca',
                  name: tv('title'),
                  intro: null,
                  photos: videos.length,
                  cover: videos[0].poster,
                }}
                href={localeHref(locale, '/videoteca')}
                count={tv('interviews', { count: videos.length })}
                locale={locale}
                labels={labels}
                priority={false}
              />
            </li>
          )}
        </ul>
      </section>

      {/* The newest arrivals, by `created_at` and nothing else: no flag to set and
          no order to keep, it follows the Drive import on its own. Last, after the
          sections, because it is what somebody who already knows the archive
          scrolls down for. It reuses the gallery's wall -- same mounted prints,
          same blur over a sensitive one -- and is not on the page at all while
          nothing has a date. */}
      {recent.length > 0 && (
        <section className="mt-14 sm:mt-20" id="recientes">
          <h2 className="t-label border-rule border-b pb-3">{t('recent')}</h2>
          <PhotoWall photos={recent} locale={locale} />
        </section>
      )}
    </>
  )
}

function SectionCard({
  section,
  locale,
  labels,
  priority,
  href,
  count,
}: {
  section: Section
  locale: Locale
  labels: PhotoImageLabels
  priority: boolean
  /** Defaults to the section's gallery. The Videoteca is the one card that is not one. */
  href?: string
  /** Defaults to the photograph count. The Videoteca counts interviews. */
  count?: string
}) {
  return (
    <Link
      href={href ?? localeHref(locale, `/categoria/${section.slug}`)}
      className="group focus-visible:outline-focus block focus-visible:outline-2 focus-visible:outline-offset-4"
    >
      {section.cover && (
        <div className="mount mount-cover">
          <PhotoImage
            photo={section.cover}
            sizes={CARD_SIZES}
            labels={labels}
            ratio={CARD_RATIO}
            priority={priority}
          />
        </div>
      )}
      <div className="plate mt-3 flex items-baseline justify-between gap-3 pt-2.5">
        <h3 className="t-credit link text-accent group-hover:text-text leading-none">
          {section.name}
        </h3>
        <span className="t-meta shrink-0">{count ?? section.photos}</span>
      </div>
    </Link>
  )
}
