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

/**
 * The page ground, `--color-ground`, and not the logo's charcoal: on Android the
 * address bar takes this colour and any other value ends the page a shade off,
 * a visible seam above the header. The manifest keeps the charcoal for
 * `background_color`, which is the icon's own ground and a different question.
 */
export const THEME_COLOR = '#1B1917'

/**
 * The two font classes, for the one page that cannot use the component below:
 * `app/not-found.tsx` is rendered inside a bare document Next supplies itself, so
 * there is no `<html>` of ours to hang the variables on and they have to ride an
 * element inside it. Exported rather than duplicated -- a second `Alegreya()` call
 * would register the same faces under a second class name.
 */
export const FONT_VARIABLES = `${alegreya.variable} ${alegreyaItalic.variable}`

export function Document({ lang, children }: { lang: string; children: ReactNode }) {
  return (
    // `suppressHydrationWarning` because the inline script in the public layout
    // puts `show-sensitive` on this element before React ever runs, and React would
    // otherwise report the class it did not write as a mismatch. It suppresses that
    // check on this element alone, not on the tree under it.
    <html lang={lang} className={`${FONT_VARIABLES} h-full`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  )
}
