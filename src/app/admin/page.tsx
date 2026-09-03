import { sql } from 'drizzle-orm'
import Link from 'next/link'
import { db } from '@/db'
import { appUser, category, photo } from '@/db/schema'
import { requireAdmin } from '@/lib/auth'

/**
 * The panel's home. Its job in T9 was to prove the boundary holds: reaching this
 * markup at all means a row in `app_user` matched, checked against the database
 * on this request and not on the one that minted the cookie.
 *
 * The figures are the panel's own and not the footer's: `archiveFacts()` counts
 * published photographs and is cached for a day, which is right for a public
 * page and wrong for the screen you open to find out what is waiting to be
 * published.
 *
 * It is laid out across the width rather than down the left edge, because it was
 * a column of five links in a 1248 px page and the whole right half was empty
 * board. Two bands, both the full width: the counts as a figure strip, and the
 * five screens as plates you aim at. Their labels are short on purpose -- they are
 * read as a set, and "Organizar la portada y las secciones" beside "Editar los
 * textos del sitio" made a paragraph of what is a menu. The addresses are
 * untouched.
 */
export default async function AdminHome() {
  const admin = await requireAdmin()

  // One round trip: the two catalogue counts ride along as scalar subqueries.
  const [figures] = await db
    .select({
      photos: sql<number>`count(*)::int`,
      published: sql<number>`count(*) filter (where ${photo.published})::int`,
      unpublished: sql<number>`count(*) filter (where not ${photo.published})::int`,
      sections: sql<number>`(select count(*) from ${category})::int`,
      admins: sql<number>`(select count(*) from ${appUser})::int`,
    })
    .from(photo)

  const rows: [string, number][] = [
    ['Fotografías', figures.photos],
    ['Publicadas', figures.published],
    ['Sin publicar', figures.unpublished],
    ['Secciones', figures.sections],
    ['Administradores', figures.admins],
  ]

  return (
    /* Centred in the page it is given rather than pinned to the top of it: this
       screen is five links and five numbers, so on a laptop it was a small block
       of text with two thirds of a screen of board under it.
       `flex-1` and not a `vh` calculation: the height left under the bar is what
       the flex column in `layout.tsx` already knows, and a `calc(100vh - 182px)`
       is two magic numbers that go stale the first time the bar changes. */
    <div className="flex flex-1 flex-col justify-center gap-12 sm:gap-16">
      <h1 className="t-headline mx-auto text-center">Hola, {admin.name ?? admin.email}</h1>

      {/* A list of label/value rows on a phone, which is the shape that reads at
          375 px, and one band of five figures from 640 up. Not `t-meta` for the
          number: its colour is unlayered author CSS and a `text-*` utility loses
          to it, so the value is built from utilities instead of overriding one. */}
      <dl className="border-rule grid border-t sm:grid-cols-5 sm:border-b">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="border-rule flex items-baseline justify-between gap-4 border-b py-3.5 sm:flex-col-reverse sm:items-center sm:gap-3 sm:border-b-0 sm:border-l sm:px-3 sm:py-7 sm:first:border-l-0"
          >
            <dt className="t-label sm:text-center">{label}</dt>
            <dd className="text-text font-mono text-[15px] leading-none tabular-nums sm:text-[38px]">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {/* The same border, ground and hover as `BUTTON` in `ui.tsx`, because that
          is what these are: the five things you came here to press. */}
      <nav aria-label="Secciones del panel" className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {[
          ['/admin/photos', 'Editar fotos'],
          ['/admin/categories', 'Editar secciones'],
          ['/admin/site-text', 'Editar textos'],
          ['/admin/import', 'Importar desde Drive'],
          ['/admin/translations', 'Traducciones'],
        ].map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className="border-rule bg-surface hover:border-accent hover:bg-surface-high focus-visible:outline-focus flex min-h-11 items-center justify-between gap-3 border px-4 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <span className="t-credit">{label}</span>
            <span className="text-accent shrink-0" aria-hidden>
              →
            </span>
          </Link>
        ))}
      </nav>
    </div>
  )
}
