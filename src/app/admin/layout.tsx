import type { Metadata } from 'next'
import Link from 'next/link'
import { currentAdmin, signOut } from '@/lib/auth'

/**
 * The panel's frame. In Spanish and never translated: only the two of them use
 * it, so it carries no i18n machinery -- the strings are written here, and T13's
 * `next-intl` wraps the public routes only.
 *
 * This layout is chrome, not a gate. It reads the session to decide whether to
 * draw a header, because the sign-in screen renders inside it too and a check
 * here would redirect that page to itself. Authorization is `requireAdmin()` at
 * the top of every page, route handler and server action underneath.
 */

/** The panel is not content. Overrides the root object: metadata merges shallowly. */
export const metadata: Metadata = {
  title: { default: 'Panel', template: '%s · Panel · Fototeca La Pelada' },
  robots: { index: false, follow: false },
}

export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  const admin = await currentAdmin()

  return (
    <>
      {admin && (
        <header className="border-rule border-b">
          <div className="max-w-content mx-auto flex w-full flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
            <Link
              href="/admin"
              className="t-signature link hover:text-focus focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              Panel
            </Link>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              {/* The address, not the name: it is the address that is on the
                  allowlist, so it is the one worth showing. */}
              <span className="t-meta">{admin.email}</span>
              {/* An anchor rather than `Link`, for the same reason as the one on
                  the photo screen: a client navigation can serve the site from a
                  five-minute-old client cache, and somebody leaving the panel to
                  look at what they just changed must not be shown what it was. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                className="t-credit link hover:text-text focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Ver el sitio
              </a>
              {/* A POST, so a prefetch or a crawler cannot sign anybody out. */}
              <form
                action={async () => {
                  'use server'
                  await signOut({ redirectTo: '/admin/signin' })
                }}
              >
                <button
                  type="submit"
                  className="t-credit link hover:text-text focus-visible:outline-focus cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  Cerrar sesión
                </button>
              </form>
            </div>
          </div>
        </header>
      )}

      <main className="max-w-content mx-auto w-full flex-1 px-4 py-10 sm:px-6 sm:py-14">
        {children}
      </main>
    </>
  )
}
