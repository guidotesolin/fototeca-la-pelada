import type { MetadataRoute } from 'next'

/**
 * From the Claude Design pass "Favicon Fototeca", which ships a `site.webmanifest`
 * alongside the icons. The icons are the monogram at 192 and 512, served by Next's
 * own `icon` convention rather than from `public/`, which carries `max-age=0`.
 *
 * `background_color` is the logo's own charcoal on purpose: it is the ground the
 * monogram sits on, so the install splash matches the icon instead of framing it.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Fototeca La Pelada',
    short_name: 'Fototeca',
    start_url: '/',
    display: 'standalone',
    theme_color: '#26292c',
    background_color: '#26292c',
    icons: [
      { src: '/icon.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon1.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
