import type { ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import { PhotoImage } from '@/components/photo-image'
import {
  PER_PAGE,
  getPhoto,
  listCategoryOrder,
  listPhotoSlugs,
  listSections,
} from '@/db/queries/gallery'
import { keyFor, publicUrl } from '@/lib/photo'
import { alternatesFor, defaultLocale, isLocale, localeHref, type Locale } from '@/i18n/config'
import { photoImageLabels } from '@/i18n/labels'

/**
 * The photograph's own page, which is the screen the whole archive exists for: it
 * is the thing Google Sites could not give, a per-photo address that can be shared,
 * cited and indexed.
 *
 * Everything on it is server-rendered. The two controls -- the sensitive card and
 * the original/restored switch -- are a native `<details>` and a `:target` pair,
 * so the page is complete with JavaScript off. Their rules live in globals.css.
 *
 * Localized since T13. The caption, the note and the section names come out of the
 * query already resolved -- the reader's language when it has been translated, the
 * Spanish behind it when it has not -- so nothing on this page branches on which
 * of the two it got. The words that are the site's own, not the archive's, come
 * from the message files.
 */
/**
 * **`true` since T12, and the premise it was `false` under is what changed.** The
 * reasoning ARCHITECTURE recorded for pre-rendering this route and nothing else
 * was that "the set of slugs is fixed by the archive" -- true while the only way
 * a photograph entered was the seed, which runs before a build. The Drive import
 * mints new slugs from the panel, so with `false` a photograph imported today has
 * no entry in `generateStaticParams`, therefore no route, and its page answers
 * **404 until somebody deploys** -- while the galleries, which are already
 * `dynamicParams = true`, list it and link to it. The panel would report success
 * and produce a broken link on the public site.
 *
 * T13 leans on it a second time, for the other three languages: see
 * `generateStaticParams` below.
 */
export const dynamicParams = true

/** The content box in globals.css: what the copy is allowed to grow to. */
const CONTENT_WIDTH = 1248

/** A record narrower than this stops being readable, whatever the copy measures. */
const MIN_COLUMN = 640

/**
 * **Every photograph in Spanish, and one per section in the other three.**
 *
 * 592 photographs in four languages is 2,368 pages, and 1,776 of them would be a
 * Spanish caption rendered under an English `<html lang>` -- because not one
 * translation exists yet, and because even a fully translated archive is
 * translated a section at a time. So the Spanish pages are pre-rendered exactly
 * as before, nothing the archive already holds got slower, and `/en/foto/…`
 * renders on its first visit and is then an ISR entry like any other, revalidated
 * by the same `GALLERY_TAG`. That is `dynamicParams = true` doing the work it was
 * already turned on for.
 *
 * **The eleven are not a hedge, they are a framework constraint, and it was
 * measured.** Returning `[]` for the other three languages -- which the docs
 * describe as "render these at runtime" -- makes Next 16.3.3 discard the static
 * params of this segment *entirely*, Spanish included: the build went from 592
 * pre-rendered photo pages to **zero**, silently, with `generateStaticParams`
 * still returning all 592 for `es`. Verified by returning two slugs for every
 * locale instead, which produced the expected eight pages. So every parent locale
 * has to come back with something, and the something worth having is the first
 * photograph of each section -- the head of every gallery, in every language, and
 * the one a reader reaches by clicking the first card.
 *
 * `params` here is the **parent's**, synchronously, which is how a nested
 * `generateStaticParams` reads the segment above it.
 */
export async function generateStaticParams({ params }: { params: { locale: string } }) {
  if (params.locale === defaultLocale) {
    return (await listPhotoSlugs()).map((slug) => ({ slug }))
  }

  // `defaultLocale` and not `params.locale`: which sections exist and how they are
  // ordered is the same in every language, so this shares the Spanish cache entry
  // instead of minting three more for translations it does not read.
  const sections = await listSections(defaultLocale)
  const orders = await Promise.all(sections.map((s) => listCategoryOrder(s.slug)))
  return orders.flatMap((order) => (order[0] ? [{ slug: order[0] }] : []))
}

/** A caption can be a paragraph. A title, a tab and a preview line cannot. */
function shorten(text: string, max: number): string {
  const line = text.split('\n')[0].trim()
  return line.length <= max ? line : `${line.slice(0, max - 1).trimEnd()}…`
}

export async function generateMetadata(
  props: PageProps<'/[locale]/foto/[slug]'>,
): Promise<Metadata> {
  const { locale, slug } = await props.params
  if (!isLocale(locale)) return {}
  const [photo, t] = await Promise.all([
    getPhoto(locale, slug),
    getTranslations({ locale, namespace: 'photo' }),
  ])
  if (!photo) return {}

  const title = photo.caption ? shorten(photo.caption, 70) : t('untitled', { slug })
  const description = photo.caption
    ? shorten(photo.caption, 200)
    : photo.credit
      ? t('descriptionWithCredit', { credit: photo.credit })
      : t('description')

  return {
    title,
    description,
    // The permalink in this language, and the same photograph in the other three.
    alternates: alternatesFor(locale, `/foto/${slug}`),
    /**
     * The two halves of the same promise, and the reason a sensitive photograph
     * cannot arrive unannounced: it is never the preview image, so a link pasted
     * into WhatsApp shows the words and nothing else, and its page tells search
     * engines not to carry the image into an image search. The page itself stays
     * indexable -- the archive is open, only the first sight of it is covered.
     */
    robots: photo.sensitive ? { index: true, follow: true, noimageindex: true } : undefined,
    openGraph: {
      title,
      description,
      locale,
      ...(photo.sensitive
        ? {}
        : {
            // ponytail: WebP, which is what the site already serves and what the
            // scrapers document support for. AVIF they do not read. This used to
            // name `photo.master_key` as the JPEG fallback if one ever refused
            // WebP; **it is not one any more.** A photograph imported from Drive
            // has `master_key` null by design and its master is not servable at
            // all, so that fallback would work for the 592 rescued from Sites
            // and hand `publicUrl` a null for every newer photograph. If a
            // scraper ever needs JPEG, encode one into the derivative set.
            images: [
              {
                url: publicUrl(keyFor(photo.webKey, photo.webWidth, 'webp')),
                width: photo.webWidth,
                height: photo.webHeight,
                alt: title,
              },
            ],
          }),
    },
  }
}

export default async function PhotoPage(props: PageProps<'/[locale]/foto/[slug]'>) {
  const { locale: askedLocale, slug } = await props.params
  if (!isLocale(askedLocale)) notFound()
  const locale: Locale = askedLocale

  const [photo, t, labels] = await Promise.all([
    getPhoto(locale, slug),
    getTranslations({ locale, namespace: 'photo' }),
    photoImageLabels(locale),
  ])
  if (!photo) notFound()

  /**
   * Previous and next are relative to a section, and a photograph can sit in more
   * than one -- so they follow the first one the panel orders. None of the 592
   * does today.
   *
   * ponytail: the neighbours are the first section's, whichever gallery the reader
   * arrived from. Carrying the source section in a query parameter is what fixes
   * that, and it costs this route its prerendering: `searchParams` is a
   * request-time API, so all 592 pages would render per request. The way out is
   * `use cache` (F19), which can read it inside a boundary without losing the
   * static shell.
   */
  const section = photo.categories[0] ?? null
  const order = section ? await listCategoryOrder(section.slug) : []
  const at = order.indexOf(slug)
  const previous = at > 0 ? order[at - 1] : null
  const next = at >= 0 && at < order.length - 1 ? order[at + 1] : null
  // Back to the gallery page this photograph is actually on, not to its first.
  const page = Math.floor(Math.max(at, 0) / PER_PAGE) + 1
  const back = localeHref(
    locale,
    section
      ? page === 1
        ? `/categoria/${section.slug}`
        : `/categoria/${section.slug}/${page}`
      : '/',
  )

  /**
   * Never upscaled: the copy is shown at its own width or narrower, which is the
   * same rule T3 encoded the derivatives under. A 649 px scan blown up to fill a
   * desktop column is a worse photograph, not a bigger one.
   */
  const width = Math.min(photo.webWidth, CONTENT_WIDTH)
  const sizes = `(min-width: ${width}px) ${width}px, 100vw`
  /**
   * The record is as wide as the copy it is about -- the hairlines under a portrait
   * end where the print does, instead of running a metre past it -- but never
   * narrower than a column that can hold a caption.
   */
  const column = Math.max(width, MIN_COLUMN)

  /**
   * The restored copy is fetched only if it is asked for, so it is never eager.
   * It also carries **its own** width and height: it is derived from its own
   * master, so its renditions are its own, and asking for the photograph's
   * widest one is asking R2 for a file that was never encoded.
   */
  const frame = (
    webKey: string,
    priority: boolean,
    size?: { webWidth: number; webHeight: number },
  ) => (
    <div className="mount" style={{ maxWidth: Math.min(size?.webWidth ?? photo.webWidth, width) }}>
      <PhotoImage
        photo={{ ...photo, webKey, ...size }}
        sizes={sizes}
        labels={labels}
        priority={priority}
        veil={false}
      />
    </div>
  )

  return (
    <article className="mx-auto" style={{ maxWidth: column }}>
      <Link
        href={back}
        className="t-credit link text-muted hover:text-text focus-visible:outline-focus inline-block py-1.5 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        ← {section ? section.name : t('home')}
      </Link>

      {/* Before the image in the document, so a reader who lands here from a shared
          link meets the warning first however the page is rendered. */}
      {photo.sensitive && (
        <details className="reveal bg-surface mt-6 p-5 sm:p-6">
          <summary className="focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2">
            <span className="t-label">{t('sensitive')}</span>
            {/* The warning stays put once the photograph is uncovered: it is the
                context the caption is read in, not a gate that disappears. It is
                the site's own wording rather than the archive's, so it lives in
                the message files -- translated once, for one kind of warning. */}
            <span className="t-intro text-muted mt-2 block">{t('warning')}</span>
            {/* The two labels share one cell, so the card measures the same open or
                closed and the photograph below it does not jump when it is revealed. */}
            <span className="reveal-action t-credit link mt-4">
              <span className="reveal-closed underline underline-offset-4">{t('reveal')}</span>
              <span className="reveal-open underline underline-offset-4">{t('hide')}</span>
            </span>
          </summary>
        </details>
      )}

      <figure className="mt-6 sm:mt-8">
        {photo.restoredWebKey ? (
          <>
            <div id="restaurada" className="ab-restored">
              {frame(
                photo.restoredWebKey,
                false,
                photo.restoredWebWidth && photo.restoredWebHeight
                  ? { webWidth: photo.restoredWebWidth, webHeight: photo.restoredWebHeight }
                  : undefined,
              )}
            </div>
            <div id="original" className="ab-original">
              {frame(photo.webKey, true)}
            </div>
            {/* Two buttons and not a drag slider: a slider on a touchscreen fights
                with the page scroll. The original is the document, so it opens.
                The two fragment identifiers stay Spanish in every language, for
                the same reason the path segments do: they are part of an address
                somebody may already have shared. */}
            <p className="ab-switch t-label mt-4 flex gap-5" style={{ maxWidth: width }}>
              <a
                href="#original"
                className="link focus-visible:outline-focus py-2 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {t('original')}
              </a>
              {/* Colour, size, the stamp and its padding are all `.ab-switch` in
                  globals.css: `.t-label` is unlayered and a utility cannot reach
                  past it. */}
              <a
                href="#restaurada"
                className="link focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {t('restored')}
              </a>
            </p>
          </>
        ) : (
          frame(photo.webKey, true)
        )}

        <figcaption className="mt-7 sm:mt-9">
          {photo.caption && <p className="t-caption-photo">{photo.caption}</p>}
          {photo.credit && (
            <p className={`t-credit ${photo.caption ? 'mt-4' : ''}`}>
              {t('courtesy', { credit: photo.credit })}
            </p>
          )}
        </figcaption>
      </figure>

      {photo.notes && <p className="t-note mt-6">{photo.notes}</p>}

      <dl className="border-rule mt-10 border-t sm:mt-12">
        {photo.yearFrom !== null && (
          <Row label={t('year')}>
            {!photo.yearTo || photo.yearTo === photo.yearFrom
              ? photo.yearFrom
              : `${photo.yearFrom}–${photo.yearTo}`}
          </Row>
        )}
        {photo.categories.length > 0 && (
          <Row label={photo.categories.length > 1 ? t('sections') : t('section')}>
            <span className="flex flex-wrap gap-x-4 gap-y-1">
              {photo.categories.map((category) => (
                <Link
                  key={category.slug}
                  href={localeHref(locale, `/categoria/${category.slug}`)}
                  className="link text-accent hover:text-text focus-visible:outline-focus py-1 focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {category.name}
                </Link>
              ))}
            </span>
          </Row>
        )}
        {/* The permalink, spelled out: it is what makes a photograph citable, and it
            does not change when the panel moves it between sections -- or when the
            reader changes language. */}
        <Row label={t('identifier')}>{photo.slug}</Row>
      </dl>

      {section && at >= 0 && (
        <nav
          aria-label={t('photographsOf', { section: section.name })}
          className="border-rule mt-14 flex items-baseline justify-between gap-4 border-t pt-6"
        >
          <span className="grow basis-0">
            {previous && (
              <Step
                href={localeHref(locale, `/foto/${previous}`)}
                rel="prev"
                label={`← ${t('previous')}`}
              />
            )}
          </span>
          <span className="t-meta shrink-0">
            {t('position', { index: at + 1, total: order.length })}
          </span>
          <span className="grow basis-0 text-right">
            {next && (
              <Step
                href={localeHref(locale, `/foto/${next}`)}
                rel="next"
                label={`${t('next')} →`}
              />
            )}
          </span>
        </nav>
      )}
    </article>
  )
}

/** A metadata row: label on the system stack, the hairline between rows. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-rule flex flex-col gap-1 border-b py-3.5 sm:flex-row sm:gap-8">
      <dt className="t-label sm:w-36 sm:shrink-0 sm:pt-1">{label}</dt>
      <dd className="t-meta">{children}</dd>
    </div>
  )
}

function Step({ href, rel, label }: { href: string; rel: string; label: string }) {
  return (
    <Link
      href={href}
      rel={rel}
      prefetch={false}
      className="t-credit link text-muted hover:text-text focus-visible:outline-focus inline-block py-2 focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      {label}
    </Link>
  )
}
