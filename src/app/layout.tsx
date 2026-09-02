import type { Metadata, Viewport } from 'next'
import { Alegreya } from 'next/font/google'
import './globals.css'

/**
 * The document, and nothing else. The public site's header and footer live in
 * `(public)/layout.tsx` and the panel's chrome in `admin/layout.tsx`, because a
 * layout cannot be opted out of: everything written here is paid for by both.
 *
 * The fonts stay at this level even though the panel is set in the system stack,
 * for a CSS reason rather than a stylistic one. `body { font-family: var(--font-serif) }`
 * resolves through `--font-alegreya`, and a `var()` pointing at an undefined
 * property is invalid at computed-value time -- so declaring the variable one
 * level down, on a wrapper inside the body, breaks the rule that uses it.
 */
const alegreya = Alegreya({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-alegreya',
  display: 'swap',
})

/**
 * The source note, and nothing else. Its own instance so it can be declared
 * `preload: false`: the file is fetched only where a rule actually asks for it,
 * which is a photo page that carries a note -- twelve of the 592 today.
 */
const alegreyaItalic = Alegreya({
  subsets: ['latin'],
  weight: ['400'],
  style: ['italic'],
  variable: '--font-alegreya-italic',
  display: 'swap',
  preload: false,
})

/**
 * `themeColor` lives in a `viewport` export in this version of Next, not in
 * `metadata`. The value is the logo's charcoal, from the favicon design pass.
 */
export const viewport: Viewport = {
  themeColor: '#26292c',
}

export const metadata: Metadata = {
  title: { default: 'Fototeca La Pelada', template: '%s · Fototeca La Pelada' },
  description:
    'Archivo digital fotográfico de La Pelada, Santa Fe. Fotografías digitalizadas con la ' +
    'autorización de sus dueños, con su epígrafe y la familia que las prestó.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es" className={`${alegreya.variable} ${alegreyaItalic.variable} h-full`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  )
}
