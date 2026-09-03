import { Alegreya } from 'next/font/google'
import type { ReactNode } from 'react'
import '@/app/globals.css'

/**
 * The document, and nothing else: `<html>`, `<body>` and the fonts.
 *
 * **It is a component rather than a layout because there are now two root
 * layouts**, and the reason is `lang`. The public site has to declare the
 * language it is actually in -- an English page announced as Spanish is
 * mispronounced by a screen reader and offered a translation it does not need --
 * and the only place `lang` can be set is on `<html>`, which is the root
 * layout's own element. So the root layout has to know the locale, which means
 * `[locale]` has to sit above it (`app/[locale]/layout.tsx`), which means
 * `/admin` needs a root layout of its own. This is the half both of them share.
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

/** The logo's charcoal, from the favicon design pass. Both root layouts declare it. */
export const THEME_COLOR = '#26292c'

export function Document({ lang, children }: { lang: string; children: ReactNode }) {
  return (
    // `suppressHydrationWarning` because the inline script in the public layout
    // puts `show-sensitive` on this element before React ever runs, and React would
    // otherwise report the class it did not write as a mismatch. It suppresses that
    // check on this element alone, not on the tree under it.
    <html
      lang={lang}
      className={`${alegreya.variable} ${alegreyaItalic.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  )
}
