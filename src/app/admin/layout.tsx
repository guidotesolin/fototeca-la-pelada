import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { currentAdmin, signOut } from '@/lib/auth'
import { Document, THEME_COLOR } from '@/components/document'
import { MenuDismiss } from '@/components/menu-dismiss'
import logo from '@/brand/header-logo.png'

/**
 * The panel's frame, and **a root layout of its own since T13**: it renders
 * `<html lang="es">` rather than inheriting one. The public site's root layout
 * sits under `[locale]` so that it can declare the language it is in, and a
 * layout above that could not be locale-aware -- so there is no shared root left
 * to inherit. `Document` is the half the two of them have in common.
 *
 * In Spanish and never translated: only the two of them use it, so it carries no
 * i18n machinery -- the strings are written here, and `next-intl` wraps the
 * public routes only. Hard-coding `lang="es"` here says exactly that.
 *
 * This layout is chrome, not a gate. It reads the session to decide whether to
 * draw a header, because the sign-in screen renders inside it too and a check
 * here would redirect that page to itself. Authorization is `requireAdmin()` at
 * the top of every page, route handler and server action underneath.
 */

/**
 * The panel is not content, and this is the root title object rather than an
 * override.
 *
 * The template leads with "Admin" and every screen underneath fills in the rest,
 * because the tab strip was the thing that did not work: five panel tabs all read
 * "Panel" and the only way to find the one you wanted was to visit them. Each page
 * now names itself -- the titles are the sidebar's own wording, so what the tab
 * says and what you clicked to get there are the same words.
 *
 * "Fototeca La Pelada" is deliberately not in it. The panel is the archive's back
 * room and never shared, so the twenty characters buy nothing and cost the part of
 * the title a narrow tab actually shows.
 */
export const metadata: Metadata = {
  title: { default: 'Admin', template: 'Admin · %s' },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
}

export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  const admin = await currentAdmin()

  return (
    <Document lang="es">
      {/* The mark the public site's settings menu reads, so that an administrator
          browsing the archive has a way back in here. Written on every screen of
          the panel and rubbed out on every screen that is not signed in -- which
          includes the one `signOut` lands on -- so it corrects itself the moment
          the session ends, expires or is revoked from the allowlist.

          `localStorage` and not a cookie: the public site sets none, and a cookie
          read in its layout would make the whole pre-rendered archive dynamic.
          It says a browser was in the panel and nothing more; the boundary is
          `requireAdmin()`, and a stale mark buys a redirect to the sign-in
          screen. */}
      <script
        dangerouslySetInnerHTML={{
          __html: admin
            ? "try{localStorage.setItem('admin','1')}catch(e){}"
            : "try{localStorage.removeItem('admin')}catch(e){}",
        }}
      />

      {admin && (
        /* The public site's bar, with the parts the panel has no use for taken
           out: the mark and the name on the left, one `<details>` on the right.
           No search and no section index -- what is on the right is the account,
           which is the only settings the panel has. The classes are the public
           header's, not near-copies of them, so the two bars stay the same bar. */
        <header className="border-rule border-b">
          <div className="max-w-content mx-auto flex w-full items-center justify-between gap-3 px-4 py-3 sm:gap-6 sm:px-6">
            <Link
              href="/admin"
              className="focus-visible:outline-focus flex shrink-0 items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              {/* Empty alt: the name is beside it, or inside the mark itself. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logo.src}
                alt=""
                width={logo.width}
                height={logo.height}
                className="h-9 w-auto sm:h-11"
              />
              {/* Only from 640, for the same reason as on the public site: the
                  lockup already reads "FOTOTECA / LA PELADA" and the row does not
                  fit a second line of words on a phone. `sr-only` rather than
                  hidden, so the link keeps its name for a screen reader at every
                  width -- and here that name is the one thing telling a reader
                  they are in the panel and not on the site. */}
              <span className="sr-only text-[26px] leading-none sm:not-sr-only">
                Panel de admin
              </span>
            </Link>

            {/* The address, not the name: it is the address that is on the
                allowlist, so it is the one worth showing -- and here it doubles as
                the label of the menu it opens, which is what the gear is on the
                public site. Both things inside it leave the panel, so neither is a
                setting to flick: they are what you do when you are done. */}
            <details className="menu min-w-0">
              <summary className="t-credit link hover:text-text focus-visible:outline-focus flex h-11 min-w-0 items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2">
                <span className="truncate">{admin.email}</span>
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
                  className="menu-caret shrink-0"
                >
                  <path d="M5 9l7 7 7-7" />
                </svg>
              </summary>

              <div className="menu-panel flex flex-col">
                {/* An anchor rather than `Link`, for the same reason as the one on
                    the photo screen: a client navigation can serve the site from a
                    five-minute-old client cache, and somebody leaving the panel to
                    look at what they just changed must not be shown what it was. */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a
                  href="/"
                  className="t-credit link hover:text-text focus-visible:outline-focus flex min-h-11 items-center focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  Volver al sitio
                </a>
                {/* A POST, so a prefetch or a crawler cannot sign anybody out. */}
                <form
                  action={async () => {
                    'use server'
                    await signOut({ redirectTo: '/admin/signin' })
                  }}
                  className="border-rule border-t"
                >
                  <button
                    type="submit"
                    className="t-credit link hover:text-text focus-visible:outline-focus flex min-h-11 w-full cursor-pointer items-center focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    Cerrar sesión
                  </button>
                </form>
              </div>
            </details>
            {/* Escape, a press outside, and a navigation close it. `<details>` has
                no light dismiss of its own; this attaches the listeners and renders
                nothing. Shared with the public header, and it finds every
                `details.menu` on the page, so there is nothing to configure. */}
            <MenuDismiss />
          </div>
        </header>
      )}

      {/* A flex column, unlike the public site's `main`, so that a screen can ask
          for the height that is left over -- the panel's home centres itself in it.
          Every other screen is unaffected: Tailwind's preflight zeroes the margins
          this would stop collapsing, and a stretched flex item lays out where a
          block did. */}
      <main className="max-w-content mx-auto flex w-full flex-1 flex-col px-4 py-10 sm:px-6 sm:py-14">
        {children}
      </main>
    </Document>
  )
}
