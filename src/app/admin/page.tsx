import { sql } from 'drizzle-orm'
import Link from 'next/link'
import { db } from '@/db'
import { appUser, category, photo } from '@/db/schema'
import { requireAdmin } from '@/lib/auth'

/**
 * The panel's home. Its job in T9 is to prove the boundary holds: reaching this
 * markup at all means a row in `app_user` matched, checked against the database
 * on this request and not on the one that minted the cookie.
 *
 * The figures are the panel's own and not the footer's: `archiveFacts()` counts
 * published photographs and is cached for a day, which is right for a public
 * page and wrong for the screen you open to find out what is waiting to be
 * published.
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
    <>
      <h1 className="t-headline">Hola, {admin.name ?? admin.email}</h1>

      <dl className="border-rule mt-10 max-w-md border-t">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="border-rule flex items-baseline justify-between border-b py-3"
          >
            <dt className="t-label">{label}</dt>
            <dd className="t-meta">{value}</dd>
          </div>
        ))}
      </dl>

      <nav aria-label="Secciones del panel" className="mt-10 flex flex-col gap-3">
        {[
          ['/admin/photos', 'Editar fotografías'],
          ['/admin/categories', 'Organizar la portada y las secciones'],
          ['/admin/site-text', 'Editar los textos del sitio'],
          ['/admin/import', 'Importar fotografías desde Drive'],
        ].map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className="t-credit link hover:text-text focus-visible:outline-focus w-fit focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {label} →
          </Link>
        ))}
      </nav>
    </>
  )
}
