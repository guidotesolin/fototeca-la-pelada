import Link from 'next/link'
import { archiveFacts, listSections, listSiteText } from '@/db/queries/gallery'
import { externalUrl } from '@/lib/url'
import { MenuDismiss } from '@/components/menu-dismiss'
import logo from '@/brand/header-logo.png'

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

export default async function PublicLayout({ children }: LayoutProps<'/'>) {
  const [sections, facts, text] = await Promise.all([
    listSections(),
    archiveFacts(),
    listSiteText(),
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
    <>
      {/* The stacking that lets the menu open over the page lives in globals.css,
            on `body > header`; see the note there. */}
      <header className="border-rule border-b">
        <div className="max-w-content mx-auto flex w-full items-center justify-between gap-3 px-4 py-3 sm:gap-6 sm:px-6">
          <Link
            href="/"
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
                  its name for a screen reader at every width. */}
            <span className="sr-only text-[26px] leading-none sm:not-sr-only">
              Fototeca La Pelada
            </span>
          </Link>

          <div className="flex min-w-0 items-center gap-3 sm:gap-7">
            <nav
              aria-label="Principal"
              className="order-last flex shrink-0 items-center sm:order-none"
            >
              {/* One `<details>` for both: a hamburger on a phone, the word from
                    640 up. Two summaries would ship the section list twice. */}
              <details className="menu">
                <summary className="t-credit link hover:text-text focus-visible:outline-focus flex items-center gap-1.5 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2">
                  <span className="sr-only sm:not-sr-only">Secciones</span>
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
                <ul className="menu-panel">
                  {sections.map((section) => (
                    <li key={section.slug}>
                      <Link
                        href={`/categoria/${section.slug}`}
                        className="t-credit link hover:text-text focus-visible:outline-focus flex items-baseline justify-between gap-6 px-3 py-2 focus-visible:outline-2 focus-visible:-outline-offset-2"
                      >
                        {section.name}
                        <span className="t-meta shrink-0">{section.photos}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
              {/* Escape and a press outside close it. `<details>` has no light
                    dismiss of its own; this attaches the two listeners and renders
                    nothing, so the section list stays out of the bundle. */}
              <MenuDismiss />
            </nav>

            {/* A GET form: search has an address of its own and works without
                  JavaScript. Reversed rather than reordered in the markup: the glass
                  reads first, and Tab still reaches the field before the button,
                  which is the order it makes sense to type in. */}
            <form
              action="/buscar"
              method="get"
              className="flex min-w-0 flex-1 flex-row-reverse items-center gap-2 sm:flex-none"
            >
              <label className="sr-only" htmlFor="q">
                Buscar en los epígrafes del archivo
              </label>
              <input
                id="q"
                name="q"
                type="search"
                placeholder="Buscar"
                className="field text-text placeholder:text-muted min-w-0 flex-1 font-sans text-[15px] sm:w-32 sm:flex-none"
              />
              <button
                type="submit"
                aria-label="Buscar"
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
            <span className="t-label">El archivo hasta hoy</span>
            {/* Non-breaking inside each figure, so a wrap falls between them and
                  never between a number and its noun. The design pinned this with a
                  `<br>`; this reflows on its own as the archive grows. */}
            <span className="t-meta">
              {facts.photos}&nbsp;fotografías · {sections.length}&nbsp;secciones · {facts.families}
              &nbsp;familias · {facts.from}&ndash;{facts.to}
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
                  <dt className="t-label">A cargo del archivo</dt>
                  <dd className="t-signature">{text.authors}</dd>
                </div>
              )}
              {text.contact && (
                <div className="flex flex-col gap-1.5 sm:gap-2">
                  <dt className="t-label">Contacto</dt>
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
                  <dt className="t-label">Redes</dt>
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
    </>
  )
}
