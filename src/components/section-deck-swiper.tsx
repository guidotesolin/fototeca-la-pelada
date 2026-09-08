'use client'

import Link from 'next/link'
import { Swiper, SwiperSlide } from 'swiper/react'
import { A11y, EffectCoverflow, Keyboard } from 'swiper/modules'
import { PhotoImage } from '@/components/photo-image'
import { localeHref, type Locale } from '@/i18n/config'
import type { PhotoImageLabels } from '@/components/photo-image'
import type { Section } from '@/db/queries/gallery'
import 'swiper/css'
import 'swiper/css/effect-coverflow'

export type SectionDeckProps = {
  sections: Section[]
  locale: Locale
  label: string
  /** The frame's own three, for the covers this draws. See `PhotoImageLabels`. */
  labels: PhotoImageLabels
}

/**
 * The index deck. Swiper with `effect: 'coverflow'`, which is exactly what the
 * reference uses (Europeana: `swiper-coverflow swiper-3d`), with the values
 * measured off it live: 300 ms transition, no autoplay, the description at
 * opacity 0 until hover, and a click on a card that is not active selecting it
 * rather than navigating. Two attempts by hand never reached this smoothness; the
 * third correct decision was the package.
 *
 * **Its own file so that Swiper has its own chunk**, which `section-deck.tsx`
 * imports through `next/dynamic` only once the viewport is wide enough. Statically
 * imported it was 93 KB of JavaScript -- 30 KB over the wire -- downloaded and
 * parsed by every phone on the index, where this component renders nothing at all:
 * Lighthouse measured 93% of that chunk unused. Nothing here changed but the file
 * it lives in.
 *
 * The locale and the region's label arrive as props: this is the one client
 * component that renders links, and reading the message files here would ship all
 * four languages to the browser for one string.
 */
export default function SectionDeckSwiper({ sections, locale, label, labels }: SectionDeckProps) {
  /**
   * A card that is not active gets selected, not followed: navigating is the next
   * click. The decision is taken on pointerdown — by the time the click arrives,
   * Swiper has already put `swiper-slide-active` on the clicked card and the guard
   * would come too late. A keyboard click (detail 0) never goes through pointerdown
   * and always navigates.
   */
  const arm = (event: React.PointerEvent<HTMLAnchorElement>) => {
    const slide = event.currentTarget.closest('.swiper-slide')
    event.currentTarget.dataset.wasActive = slide?.classList.contains('swiper-slide-active')
      ? '1'
      : ''
  }
  const guard = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.detail !== 0 && event.currentTarget.dataset.wasActive !== '1') {
      event.preventDefault()
    }
  }

  return (
    <div className="deck" role="region" aria-label={label}>
      <Swiper
        modules={[EffectCoverflow, A11y, Keyboard]}
        effect="coverflow"
        centeredSlides
        slideToClickedSlide
        grabCursor
        speed={300}
        keyboard={{ enabled: true }}
        initialSlide={Math.floor(sections.length / 2)}
        slidesPerView="auto"
        coverflowEffect={{
          rotate: 0,
          stretch: 96,
          depth: 200,
          modifier: 1,
          scale: 0.86,
          slideShadows: false,
        }}
      >
        {sections.map((section) => (
          <SwiperSlide key={section.slug} className="deck-card">
            <Link
              href={localeHref(locale, `/categoria/${section.slug}`)}
              prefetch={false}
              onPointerDown={arm}
              onClick={guard}
              className="focus-visible:outline-focus absolute inset-0 block overflow-hidden focus-visible:outline-2"
            >
              {/* Never `priority`: on a phone the deck is absent, and an eager
                  high-priority image would be fetched all the same, stealing
                  bandwidth from the visible content. Lazy, it is not fetched. */}
              {section.cover && (
                <PhotoImage photo={section.cover} sizes="240px" labels={labels} fill />
              )}
              {/* The description, as in the reference: always in the DOM, shown on hover. */}
              <span className="deck-veil">
                {section.intro && <span className="deck-intro">{section.intro}</span>}
              </span>
              <span className="deck-chip">
                {section.name} · {section.photos}
              </span>
            </Link>
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  )
}
