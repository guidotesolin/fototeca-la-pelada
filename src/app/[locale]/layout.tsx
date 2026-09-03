import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import type { Metadata, Viewport } from 'next'
import { archiveFacts, listSections, listSiteText } from '@/db/queries/gallery'
import { SITE_URL, externalUrl } from '@/lib/url'
import { Document, THEME_COLOR } from '@/components/document'
import { MenuDismiss } from '@/components/menu-dismiss'
import { SensitiveSwitch } from '@/components/sensitive-switch'
import { LOCALE_LABELS, isLocale, localeHref, locales } from '@/i18n/config'
import logo from '@/brand/header-logo.png'
import type { Locale } from '@/i18n/config'

/**
 * The public site's root layout, and the whole of the localisation boundary.
 *
 * `[locale]` sits above it rather than under a route group, which is what makes
 * the locale a segment this layout can read -- and therefore what lets `<html
 * lang>` be true. `/admin` has a root layout of its own and no locale segment,
 * so the panel is outside this system entirely: _Language conventions_ keeps it
 * in Spanish with no i18n machinery, and this is where that separation is
 * physical rather than a convention.
 *
 * Every string on this page comes from one of two places and never from a third:
 * the **message files** carry what the site says as a product -- labels, and the
 * two sentences that are copy -- and the **database** carries what the authors
 * wrote. Nothing is inline any more.
 */
export const viewport: Viewport = {
  themeColor: THEME_COLOR,
}

/**
 * All four, pre-rendered. The locale is the cheapest segment in the tree: four
 * home pages, and the galleries under it come to 30 per language -- eleven page
 * ones and nineteen paged, `ceil(n/24)` over the eleven sections.
 * `/foto/[slug]` is the one that does not multiply -- see its own note.
 */
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

/**
 * `metadataBase` arrives with this task, because `alternates` is written as
 * paths: a relative alternate with no base is a build error, and an absolute one
 * would hard-code the origin into every page of the archive.
 */
export async function generateMetadata(props: LayoutProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await props.params
  const t = await getTranslations({ locale, namespace: 'meta' })

  return {
    metadataBase: new URL(SITE_URL),
    title: { default: 'Fototeca La Pelada', template: '%s · Fototeca La Pelada' },
    description: t('description'),
  }
}

/**
 * The three marks, drawn from primitives instead of pasted brand paths. This design
 * is built from hairlines -- the mount's inner rule, the search field's underline,
 * the plate's top border -- so a stroked glyph belongs where a solid logo would sit
 * as a foreign object. They carry no colour of their own: `currentColor` means the
 * footer's accent, its hover and its focus ring all reach them for free.
 *
 * 20px at stroke 2.1, and not the 17px the label is set at: rasterised at the real
 * size, a thinner stroke lands between pixels and antialiases down to a dim brown --
 * the f stops being legible and Instagram's dot disappears on a 1x screen. Checked
 * by rendering the sizes against the strokes rather than by eye at display scale.
 */
function NetworkIcon({ name }: { name: string }) {
  const shape = {
    Facebook: (
      <>
        <circle cx="12" cy="12" r="9.25" />
        <path d="M15.1 8.1h-2.05c-1.1 0-1.8.78-1.8 1.92V21.2" />
        <path d="M9.2 13.45h5.3" />
      </>
    ),
    Instagram: (
      <>
        <rect x="3.4" y="3.4" width="17.2" height="17.2" rx="5" />
        <circle cx="12" cy="12" r="4.15" />
        <circle cx="17.05" cy="6.95" r="1.15" fill="currentColor" stroke="none" />
      </>
    ),
    YouTube: (
      <>
        <rect x="2.4" y="5.7" width="19.2" height="12.6" rx="3.6" />
        <path d="M10.55 9.4 15.85 12l-5.3 2.6Z" fill="currentColor" stroke="none" />
      </>
    ),
  }[name]

  if (!shape) return null

  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      {shape}
    </svg>
  )
}

export default async function PublicLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale: asked } = await params
  // `[locale]` is the topmost segment, so it catches any unknown first path
  // segment the proxy did not rewrite. A value that is not one of the four is
  // not a language, it is a 404.
  if (!isLocale(asked)) notFound()
  const locale: Locale = asked

  const [sections, facts, text, t, tf, tl] = await Promise.all([
    listSections(locale),
    archiveFacts(),
    listSiteText(locale),
    getTranslations({ locale, namespace: 'header' }),
    getTranslations({ locale, namespace: 'footer' }),
    getTranslations({ locale, namespace: 'languages' }),
  ])

  /**
   * The archive's own accounts. Labels in code, addresses in the database: which
   * networks they are on is theirs to change, and a fourth one must not need a
   * deploy. A row that is missing or does not pass the guard drops out silently.
   */
  const networks = [
    ['Facebook', text.facebook_url],
    ['Instagram', text.instagram_url],
    ['YouTube', text.youtube_url],
  ].flatMap(([name, value]) => {
    const href = externalUrl(value)
    return href ? [{ name, href }] : []
  })

  return (
    <Document lang={locale}>
      {/* The reader's own answer to the veil, read before anything paints so a
          reader who already lifted it never watches the blur come off. `try`
          because a private window throws on the first `localStorage` touch, and a
          throw here would take the rest of the document with it. The failure is
          the safe one either way: no class, so the photographs stay covered. */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            "try{if(localStorage.getItem('sensitive'))" +
            "document.documentElement.classList.add('show-sensitive')}catch(e){}",
        }}
      />

      {/* The stacking that lets the menu open over the page lives in globals.css,
            on `body > header`; see the note there. */}
      <header className="border-rule border-b">
        <div className="max-w-content mx-auto flex w-full items-center justify-between gap-3 px-4 py-3 sm:gap-6 sm:px-6">
          <Link
            href={localeHref(locale, '/')}
            className="focus-visible:outline-focus flex shrink-0 items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            {/* Empty alt: the name is beside it, or inside the mark itself. */}
            <img
              src={logo.src}
              alt=""
              width={logo.width}
              height={logo.height}
              className="h-9 w-auto sm:h-11"
            />
            {/* Only from 640: on a phone the lockup already reads "FOTOTECA / LA
                  PELADA", so the wordmark beside it is the same words twice and the
                  row does not fit. `sr-only` rather than hidden, so the link keeps
                  its name for a screen reader at every width. The name is not
                  translated: it is the archive's name, in any language. */}
            <span className="sr-only text-[26px] leading-none sm:not-sr-only">
              Fototeca La Pelada
            </span>
          </Link>

          {/* DOM order is the desktop order — sections, search, settings. On a phone
              the sections trigger is sent to the end with `order-last`, which puts the
              row in the order a thumb reaches it: field, settings, hamburger. */}
          <div className="flex min-w-0 items-center gap-2 sm:gap-6">
            <nav
              aria-label={t('nav')}
              className="order-last flex shrink-0 items-center sm:order-none"
            >
              {/* One `<details>` for both: a hamburger on a phone, the word from
                    640 up. Two summaries would ship the section list twice. */}
              {/* `name` makes the two panels an exclusive accordion in the browser
                    itself. Without it the mutual exclusion lived only in the pointer
                    handler, so a keyboard could open both at once and the settings
                    dropdown painted over the section links underneath it. An old
                    WebView ignores the attribute and degrades to exactly that, which
                    is what makes it safe here. */}
              <details name="header" className="menu menu-wide">
                <summary className="t-credit link hover:text-text focus-visible:outline-focus flex h-11 items-center gap-1.5 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 sm:h-auto">
                  <span className="sr-only sm:not-sr-only">{t('sections')}</span>
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.1}
                    strokeLinecap="round"
                    aria-hidden
                    className="shrink-0 sm:hidden"
                  >
                    <path d="M4 7h16M4 12h16M4 17h16" />
                  </svg>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.1}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                    className="menu-caret hidden shrink-0 sm:block"
                  >
                    <path d="M5 9l7 7 7-7" />
                  </svg>
                </summary>
                {/* The panel spans the bar instead of hanging off the word: eleven
                      sections in four columns are read at a glance, where a 232 px
                      column made them a scroll. The list keeps the page's own
                      margins, so the columns land under the content and not under
                      the viewport. */}
                <div className="menu-panel-wide">
                  <ul className="max-w-content mx-auto grid w-full grid-cols-2 gap-x-4 px-4 py-3 sm:grid-cols-3 sm:gap-x-8 sm:px-6 sm:py-5 lg:grid-cols-4">
                    {sections.map((section) => (
                      <li key={section.slug}>
                        <Link
                          href={localeHref(locale, `/categoria/${section.slug}`)}
                          className="t-credit link hover:bg-surface-high hover:text-text focus-visible:outline-focus flex min-h-11 items-baseline justify-between gap-4 px-3 py-2.5 focus-visible:outline-2 focus-visible:-outline-offset-2"
                        >
                          {section.name}
                          <span className="t-meta shrink-0">{section.photos}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
              {/* Escape, a press outside, and a navigation close it. `<details>`
                    has no light dismiss of its own; this attaches the listeners and
                    renders nothing, so the section list stays out of the bundle. It
                    finds every `details.menu`, so the settings panel below is covered
                    too. */}
              <MenuDismiss />
            </nav>

            {/* A GET form: search has an address of its own and works without
                  JavaScript. Reversed rather than reordered in the markup: the glass
                  reads first, and Tab still reaches the field before the button,
                  which is the order it makes sense to type in. */}
            <form
              action={localeHref(locale, '/buscar')}
              method="get"
              className="flex min-w-0 flex-1 flex-row-reverse items-center gap-2 sm:flex-none"
            >
              <label className="sr-only" htmlFor="q">
                {t('searchLabel')}
              </label>
              <input
                id="q"
                name="q"
                type="search"
                placeholder={t('search')}
                className="field text-text placeholder:text-muted min-w-0 flex-1 font-sans text-[15px] sm:w-32 sm:flex-none"
              />
              <button
                type="submit"
                aria-label={t('search')}
                className="link text-accent hover:text-text focus-visible:outline-focus shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <svg
                  width="19"
                  height="19"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.1}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <circle cx="10.5" cy="10.5" r="6.75" />
                  <path d="M15.5 15.5 21 21" />
                </svg>
              </button>
            </form>

            {/* Only where there is room for the two groups to read as two: on a
                  phone the icons are far enough apart already. */}
            <span className="bg-rule hidden h-6 w-px shrink-0 sm:block" aria-hidden />

            <details name="header" className="menu shrink-0">
              <summary className="t-credit link hover:text-text focus-visible:outline-focus flex h-11 items-center gap-2 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2">
                <span className="sr-only sm:not-sr-only sm:text-[15px]">{t('settings')}</span>
                {/* A gear drawn as a hub and eight teeth rather than a toothed
                      outline: at 20 px the outline's notches close up into a dark
                      ring, the same legibility test the footer's marks were drawn
                      to. Same stroke as those, so the whole set matches. */}
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.1}
                  strokeLinecap="round"
                  aria-hidden
                  className="shrink-0"
                >
                  <circle cx="12" cy="12" r="4.8" />
                  <path d="M12 4.3v2.9M12 16.8v2.9M19.7 12h-2.9M4.3 12h2.9M15.39 8.61 17.44 6.56M8.61 15.39 6.56 17.44M15.39 15.39 17.44 17.44M8.61 8.61 6.56 6.56" />
                </svg>
              </summary>

              <div className="menu-panel">
                <p className="t-label">{t('language')}</p>
                {/* Anchors, and the same four cells the header redesign drew: the
                      control is not redesigned here, it is given its hrefs and loses
                      `disabled`. `aria-current` rather than `aria-pressed`, which is
                      a button's state and not a link's.

                      `/idioma/<code>` and not the current page in the other
                      language, because a layout cannot know the path it is wrapping
                      -- the only way to read it on the server is a header, and
                      reading one would make all 592 photo pages dynamic. The proxy
                      answers this address with a redirect to the same page in the
                      chosen language, so it is a real navigation with no client
                      state and it works with JavaScript off. */}
                <div className="mt-3 flex gap-1.5" role="group" aria-label={t('language')}>
                  {locales.map((code) => (
                    <a
                      key={code}
                      href={`/idioma/${code}`}
                      rel="nofollow"
                      hrefLang={code}
                      aria-current={code === locale ? 'true' : undefined}
                      className={`focus-visible:outline-focus flex-1 border py-2 text-center font-sans text-[14px] focus-visible:outline-2 focus-visible:-outline-offset-2 ${
                        code === locale
                          ? 'border-accent text-accent bg-surface-high'
                          : 'border-rule text-muted hover:text-text'
                      }`}
                    >
                      {LOCALE_LABELS[code]}
                      {/* Spoken, not shown: "ENG" alone is a code, and the
                          language's own name is what a screen reader should read.
                          Appended rather than an `aria-label`, so the accessible
                          name still contains the visible text -- WCAG 2.5.3, which
                          is what lets a voice user say the word they can see. */}
                      <span className="sr-only"> {tl(code)}</span>
                    </a>
                  ))}
                </div>

                <div className="border-rule mt-5 flex items-start justify-between gap-4 border-t pt-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-text font-sans text-[15px] leading-none">
                      {t('sensitive')}
                    </span>
                    <span className="text-muted font-sans text-[12.5px] leading-snug">
                      {t('sensitiveHint')}
                    </span>
                  </div>
                  <SensitiveSwitch label={t('sensitiveSwitch')} />
                </div>
              </div>
            </details>
          </div>
        </div>
      </header>

      <main className="max-w-content mx-auto w-full flex-1 px-4 py-10 sm:px-6 sm:py-16">
        {children}
      </main>

      {/* "Álbum cerrado — la última página": the thanks corner-mounted like the
            last print pasted into an album, the rights notice as fine print inside
            the same mount, and authors/contact/networks as the signature on its back.
            Every sentence is the authors', read from the database; code carries only
            the labels. */}
      <footer className="mt-20">
        <div className="max-w-content mx-auto w-full px-4 pb-14 sm:px-6 sm:pb-22">
          {/* The hairline runs the content width, not the viewport's: it lines up
                with the columns above it. */}
          <div className="bg-rule h-px" />

          <div className="flex flex-col gap-1.5 pt-4.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-8 sm:pt-5">
            <span className="t-label">{tf('archiveToDate')}</span>
            {/* Non-breaking inside each figure, so a wrap falls between them and
                  never between a number and its noun. The design pinned this with a
                  `<br>`; this reflows on its own as the archive grows. The three
                  counts are ICU plurals, which is the reason the nouns are not
                  simply appended: "1 sección" and "11 secciones" do not share a
                  suffix in any of the four languages. */}
            <span className="t-meta">
              {[
                tf('photos', { count: facts.photos }),
                tf('sections', { count: sections.length }),
                tf('families', { count: facts.families }),
                `${facts.from}–${facts.to}`,
              ]
                // The only space inside a plural is the one that follows the
                // number, so this is that space and no other: a wrap falls
                // between the figures and never between a number and its noun.
                .map((figure) => figure.replace(' ', ' '))
                .join(' · ')}
            </span>
          </div>

          <div className="mt-8 grid gap-8 sm:mt-14 sm:grid-cols-12 sm:items-start sm:gap-6">
            <div className="album sm:col-span-7">
              <span className="album-corner album-corner-tl" />
              <span className="album-corner album-corner-tr" />
              <span className="album-corner album-corner-bl" />
              <span className="album-corner album-corner-br" />
              {text.thanks && <p className="t-thanks">{text.thanks}</p>}
              <div className="album-rule" />
              {text.rights_notice && <p className="t-fineprint">{text.rights_notice}</p>}
            </div>

            <dl className="border-rule flex flex-col gap-6 border-l pl-4.5 sm:col-span-4 sm:col-start-9 sm:gap-7 sm:pl-7">
              {text.authors && (
                <div className="flex flex-col gap-1.5 sm:gap-2">
                  <dt className="t-label">{tf('inCharge')}</dt>
                  <dd className="t-signature">{text.authors}</dd>
                </div>
              )}
              {text.contact && (
                <div className="flex flex-col gap-1.5 sm:gap-2">
                  <dt className="t-label">{tf('contact')}</dt>
                  <dd>
                    <a
                      href={`mailto:${text.contact}`}
                      className="t-credit link hover:text-focus focus-visible:outline-focus flex min-h-11 items-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-[3px] sm:min-h-0"
                    >
                      {text.contact}
                    </a>
                  </dd>
                </div>
              )}
              {networks.length > 0 && (
                <div className="flex flex-col gap-1 sm:gap-3">
                  <dt className="t-label">{tf('networks')}</dt>
                  <dd className="flex flex-col sm:gap-2.5">
                    {networks.map(({ name, href }) => (
                      <a
                        key={name}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="t-credit link hover:text-focus focus-visible:outline-focus flex min-h-11 items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-[3px] sm:min-h-0 sm:gap-2.5"
                      >
                        <NetworkIcon name={name} />
                        <span className="underline underline-offset-4">{name}</span>
                      </a>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </footer>
    </Document>
  )
}
