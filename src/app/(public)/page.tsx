import Link from 'next/link'
import { SectionDeck } from '@/components/section-deck'
import { PhotoImage } from '@/components/photo-image'
import { PhotoWall } from '@/components/photo-wall'
import { archiveFacts, listFeatured, listSections, listSiteText } from '@/db/queries/gallery'
import { mapEmbedUrl } from '@/lib/url'
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

export default async function Home() {
  const [sections, facts, text, featured] = await Promise.all([
    listSections(),
    archiveFacts(),
    listSiteText(),
    listFeatured(),
  ])
  const mapUrl = mapEmbedUrl(text.map_embed_url)

  return (
    <>
      <section>
        {text.home_title && <h1 className="t-headline mx-auto text-center">{text.home_title}</h1>}

        {/* The deck (Swiper, desktop only): the reference is Europeana. Its own
            aria-label names it, so dropping the heading costs nothing spoken. It
            opens the page, and a phone never sees it — the component returns null
            below 900 px, so nothing here reserves space it will not use. */}
        <SectionDeck sections={sections} />

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
                  Lazy, because it is Google's payload and not our content. */}
              <div className="print relative" style={{ aspectRatio: '4 / 3' }}>
                <iframe
                  src={mapUrl}
                  title="La Pelada map"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  className="absolute inset-0 h-full w-full border-0"
                />
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

      {/* The highlights, which are `photo.featured` and nothing else: no order of
          their own, no second table, and the strip is simply not there while
          nothing is marked. It reuses the gallery's wall rather than inventing a
          row of its own -- same mounted prints, same blur over a sensitive one. */}
      {featured.length > 0 && (
        <section className="mt-14 sm:mt-20" id="destacadas">
          <h2 className="t-label border-rule border-b pb-3">Destacadas</h2>
          <PhotoWall photos={featured} />
        </section>
      )}

      <section className="mt-14 sm:mt-20" id="secciones">
        {/* The list, which on a phone is all there is, and on desktop sits below.
            An h2: it is the section's only heading now, and h1 -> h3 would skip. */}
        <h2 className="t-label border-rule mt-6 border-b pb-3 xl:mt-10">
          Todas las secciones · {facts.photos} fotografías
        </h2>
        <ul className="section-grid mt-6">
          {sections.map((section, index) => (
            <li key={section.slug}>
              <SectionCard section={section} priority={index < 2} />
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

function SectionCard({ section, priority }: { section: Section; priority: boolean }) {
  return (
    <Link
      href={`/categoria/${section.slug}`}
      className="group focus-visible:outline-focus block focus-visible:outline-2 focus-visible:outline-offset-4"
    >
      {section.cover && (
        <div className="mount mount-cover">
          <PhotoImage
            photo={section.cover}
            sizes={CARD_SIZES}
            ratio={CARD_RATIO}
            priority={priority}
          />
        </div>
      )}
      <div className="plate mt-3 flex items-baseline justify-between gap-3 pt-2.5">
        <h3 className="t-credit link text-accent group-hover:text-text leading-none">
          {section.name}
        </h3>
        <span className="t-meta shrink-0">{section.photos}</span>
      </div>
    </Link>
  )
}
