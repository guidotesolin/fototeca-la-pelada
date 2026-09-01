import type { ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { PhotoImage } from '@/components/photo-image'
import { PER_PAGE, getPhoto, listCategoryOrder, listPhotoSlugs } from '@/db/queries/gallery'
import { keyFor, publicUrl } from '@/lib/photo'

/**
 * The photograph's own page, which is the screen the whole archive exists for: it
 * is the thing Google Sites could not give, a per-photo address that can be shared,
 * cited and indexed.
 *
 * Everything on it is server-rendered. The two controls -- the sensitive card and
 * the original/restored switch -- are a native `<details>` and a `:target` pair,
 * so the page is complete with JavaScript off. Their rules live in globals.css.
 *
 * Not localized on purpose: T6 put the public routes at the root and T13 brings
 * next-intl, so the Spanish sits inline here rather than in a message file that
 * does not exist yet.
 */
export const dynamicParams = false

/** Twelve of the 592, and the wording describes rather than judges. */
const WARNING = 'Contiene imágenes de faena de animales.'

/** The content box in globals.css: what the copy is allowed to grow to. */
const CONTENT_WIDTH = 1248

/** A record narrower than this stops being readable, whatever the copy measures. */
const MIN_COLUMN = 640

export async function generateStaticParams() {
  return (await listPhotoSlugs()).map((slug) => ({ slug }))
}

/** A caption can be a paragraph. A title, a tab and a preview line cannot. */
function shorten(text: string, max: number): string {
  const line = text.split('\n')[0].trim()
  return line.length <= max ? line : `${line.slice(0, max - 1).trimEnd()}…`
}

export async function generateMetadata(props: PageProps<'/foto/[slug]'>): Promise<Metadata> {
  const { slug } = await props.params
  const photo = await getPhoto(slug)
  if (!photo) return {}

  const title = photo.caption ? shorten(photo.caption, 70) : `Fotografía ${slug}`
  const description = photo.caption
    ? shorten(photo.caption, 200)
    : `Fotografía del archivo de La Pelada${photo.credit ? `. Cortesía: ${photo.credit}` : ''}.`

  return {
    title,
    description,
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
      ...(photo.sensitive
        ? {}
        : {
            // ponytail: WebP, which is what the site already serves and what the
            // scrapers document support for. AVIF they do not read; if one ever
            // refuses WebP too, `photo.master_key` is the same image as JPEG.
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

export default async function PhotoPage(props: PageProps<'/foto/[slug]'>) {
  const { slug } = await props.params
  const photo = await getPhoto(slug)
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
  const back = section
    ? page === 1
      ? `/categoria/${section.slug}`
      : `/categoria/${section.slug}/${page}`
    : '/'

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

  /** The restored copy is fetched only if it is asked for, so it is never eager. */
  const frame = (webKey: string, priority: boolean) => (
    <div className="mount" style={{ maxWidth: width }}>
      <PhotoImage photo={{ ...photo, webKey }} sizes={sizes} priority={priority} veil={false} />
    </div>
  )

  return (
    <article className="mx-auto" style={{ maxWidth: column }}>
      <Link
        href={back}
        className="t-credit link text-muted hover:text-text focus-visible:outline-focus inline-block py-1.5 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        ← {section ? section.name : 'Inicio'}
      </Link>

      {/* Before the image in the document, so a reader who lands here from a shared
          link meets the warning first however the page is rendered. */}
      {photo.sensitive && (
        <details className="reveal bg-surface mt-6 p-5 sm:p-6">
          <summary className="focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2">
            <span className="t-label">Contenido sensible</span>
            {/* The warning stays put once the photograph is uncovered: it is the
                context the caption is read in, not a gate that disappears. */}
            <span className="t-intro text-muted mt-2 block">{WARNING}</span>
            {/* The two labels share one cell, so the card measures the same open or
                closed and the photograph below it does not jump when it is revealed. */}
            <span className="reveal-action t-credit link mt-4">
              <span className="reveal-closed underline underline-offset-4">Ver la fotografía</span>
              <span className="reveal-open underline underline-offset-4">
                Ocultar la fotografía
              </span>
            </span>
          </summary>
        </details>
      )}

      <figure className="mt-6 sm:mt-8">
        {photo.restoredWebKey ? (
          <>
            <div id="restaurada" className="ab-restored">
              {frame(photo.restoredWebKey, false)}
            </div>
            <div id="original" className="ab-original">
              {frame(photo.webKey, true)}
            </div>
            {/* Two buttons and not a drag slider: a slider on a touchscreen fights
                with the page scroll. The original is the document, so it opens. */}
            <p className="ab-switch t-label mt-4 flex gap-5" style={{ maxWidth: width }}>
              <a
                href="#original"
                className="link hover:text-text focus-visible:outline-focus py-2 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Original
              </a>
              <a
                href="#restaurada"
                className="link text-muted hover:text-text focus-visible:outline-focus py-2 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Restaurada
              </a>
            </p>
          </>
        ) : (
          frame(photo.webKey, true)
        )}

        <figcaption className="mt-7 sm:mt-9">
          {photo.caption && <p className="t-caption-photo">{photo.caption}</p>}
          {photo.credit && (
            <p className={`t-credit ${photo.caption ? 'mt-4' : ''}`}>Cortesía: {photo.credit}</p>
          )}
        </figcaption>
      </figure>

      {photo.notes && <p className="t-note mt-6">{photo.notes}</p>}

      <dl className="border-rule mt-10 border-t sm:mt-12">
        {photo.yearFrom !== null && (
          <Row label="Año">
            {!photo.yearTo || photo.yearTo === photo.yearFrom
              ? photo.yearFrom
              : `${photo.yearFrom}–${photo.yearTo}`}
          </Row>
        )}
        {photo.categories.length > 0 && (
          <Row label={photo.categories.length > 1 ? 'Secciones' : 'Sección'}>
            <span className="flex flex-wrap gap-x-4 gap-y-1">
              {photo.categories.map((category) => (
                <Link
                  key={category.slug}
                  href={`/categoria/${category.slug}`}
                  className="link text-accent hover:text-text focus-visible:outline-focus py-1 focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {category.name}
                </Link>
              ))}
            </span>
          </Row>
        )}
        {/* The permalink, spelled out: it is what makes a photograph citable, and it
            does not change when the panel moves it between sections. */}
        <Row label="Identificador">{photo.slug}</Row>
      </dl>

      {section && at >= 0 && (
        <nav
          aria-label={`Fotografías de ${section.name}`}
          className="border-rule mt-14 flex items-baseline justify-between gap-4 border-t pt-6"
        >
          <span className="grow basis-0">
            {previous && <Step href={`/foto/${previous}`} rel="prev" label="← Anterior" />}
          </span>
          <span className="t-meta shrink-0">
            {at + 1} de {order.length}
          </span>
          <span className="grow basis-0 text-right">
            {next && <Step href={`/foto/${next}`} rel="next" label="Siguiente →" />}
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
