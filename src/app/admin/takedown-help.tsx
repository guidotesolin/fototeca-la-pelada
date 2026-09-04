import { SITE_URL } from '@/lib/url'
import { locales, localeHref } from '@/i18n/config'

/**
 * The half of a takedown the panel cannot carry out, offered where and when it is
 * actually needed: inside _Publicación_, on the photograph that was just hidden.
 *
 * It took two moves to land here. T14 first wrote it as `docs/OPERACIONES.md`,
 * which Lautaro and Marcos have no way of reaching; then as a block on the panel's
 * home, which they reach and would never think to open. Here it appears **the
 * moment there is something to do about it** -- the button above has just answered,
 * the section's own paragraph has just said the photograph is out of the site, and
 * the next sentence says the part that is not true yet.
 *
 * Two things follow from the position, and both are the reason it is worth a
 * component rather than a paragraph:
 *
 * - **The address is this photograph's**, built from `SITE_URL` like the sitemap's,
 *   so it is the string to paste rather than an example to adapt. Locally it reads
 *   `http://localhost:3000`, which is honest: it follows the deployment.
 * - **It is drawn only while the photograph is hidden.** On a published one there
 *   is no next step, and a panel that says there is one is a panel being ignored.
 *
 * Nothing here repeats the section above it. What a takedown does not cover -- the
 * image file still answering at its own address -- is already the last sentence of
 * _Publicación_, and saying it twice is how one of the two goes stale.
 *
 * Wording follows `ui.tsx`: the archive's terms, never the storage's.
 */
export function TakedownHelp({
  path,
  noun = 'fotografía',
}: {
  path: string
  /**
   * What this page holds, so the instructions name it. A default rather than a
   * required prop: 592 of the archive's pages are photographs and one screen was
   * calling this before there was anything else to call it about.
   */
  noun?: 'fotografía' | 'entrevista'
}) {
  const url = (locale: (typeof locales)[number]) => new URL(localeHref(locale, path), SITE_URL).href

  return (
    /* `.menu` from `globals.css`, which gives exactly three things: position
       relative, the native marker removed twice (`::marker` and WebKit's own), and
       the caret rotated when open. The absolute panel that would fight an inline
       block lives on `.menu-panel`, which this does not use -- so no new CSS.

       A native `<details>`, like every other disclosure on the site: it opens with
       JavaScript off, the keyboard works it with no ARIA, and it stays closed. The
       summary is written to carry the whole message on its own, because the failure
       that matters is nobody opening it. */
    <details className="menu border-rule bg-surface mt-6 border">
      <summary className="hover:bg-surface-high focus-visible:outline-focus flex min-h-11 items-center justify-between gap-3 px-4 py-3 focus-visible:outline-2 focus-visible:-outline-offset-2">
        <span className="t-credit">Siguiente paso: pedirle a Google que la saque</span>
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
          className="menu-caret text-accent shrink-0"
        >
          <path d="M5 9l7 7 7-7" />
        </svg>
      </summary>

      {/* Two elements and not one, because `.t-fineprint` carries `max-width: 58ch`
          -- the reading measure this prose wants, and exactly what a bordered box
          must not inherit: on the container it capped the padding box too, so the
          rule under the summary stopped halfway across. The box is full width, the
          column inside it is not. */}
      <div className="border-rule border-t px-4 py-6 sm:px-6">
        <div className="t-fineprint flex flex-col gap-5">
          <p>
            Ya salió del sitio, pero <strong>Google guarda una copia</strong> y la sigue mostrando
            en los resultados durante días o semanas. Sacarla de ahí es un trámite aparte, y
            conviene hacerlo el mismo día.
          </p>

          <ol className="ml-5 flex list-decimal flex-col gap-2">
            <li>
              Entrá a{' '}
              <a
                href="https://search.google.com/search-console"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline underline-offset-4"
              >
                search.google.com/search-console
              </a>{' '}
              con la cuenta de Google del archivo.
            </li>
            <li>
              Arriba a la izquierda, elegí la propiedad <strong>{new URL(SITE_URL).host}</strong>.
            </li>
            <li>
              En el menú de la izquierda, <strong>Retiradas</strong> (en inglés, <em>Removals</em>).
            </li>
            <li>
              <strong>Nueva solicitud</strong> → pestaña{' '}
              <strong>Retirar temporalmente la URL</strong>.
            </li>
            <li>
              Pegá esta dirección, que es la de esta {noun}:
              {/* The string to paste, not an example to adapt: selectable, whole, and
                built from the same origin the sitemap writes. */}
              <code className="border-rule bg-surface-high text-text mt-2 block border px-3 py-2 break-all select-all">
                {url('es')}
              </code>
            </li>
            <li>
              Dejá marcado <strong>Retirar solo esta URL</strong> y confirmá.
            </li>
          </ol>

          <p>Google la saca de los resultados en unas horas.</p>

          {/* The one thing that makes the two halves make sense together, and the one
            most likely to be read as a problem when it is the opposite. */}
          <p className="border-accent border-l-2 pl-4">
            <strong>«Temporal» dura unos seis meses, y no es un problema.</strong> Esa opción es
            para que desaparezca rápido. Lo que la saca para siempre es que su página conteste que
            fue retirada, que es lo que ya hace desde que la despublicaste: cuando Google vuelva a
            pasar y vea esa respuesta, la borra definitivamente. Hacen falta las dos cosas.
            Despublicarla sin este trámite tarda semanas, y el trámite sin despublicarla se vence y
            la {noun} vuelve a aparecer.
          </p>

          <div className="flex flex-col gap-2">
            <p>
              <strong>Si aparece en otro idioma.</strong> Cada {noun} tiene una dirección por
              idioma. Si en Google ves la versión en inglés, francés o italiano, repetí el trámite
              con esa dirección. Las cuatro contestan que fue retirada; esto es sólo para apurar a
              Google.
            </p>
            <ul className="flex flex-col gap-1">
              {locales
                .filter((locale) => locale !== 'es')
                .map((locale) => (
                  <li key={locale}>
                    <code className="text-muted break-all select-all">{url(locale)}</code>
                  </li>
                ))}
            </ul>
          </div>

          <p className="border-rule border-t pt-5">
            <strong>Anotá el pedido</strong> — guardá el mail, o escribí en algún lado quién pidió
            qué y cuándo. Todavía no hay una pantalla para esto, y sirve si después vuelven a
            preguntar.
          </p>
        </div>
      </div>
    </details>
  )
}
