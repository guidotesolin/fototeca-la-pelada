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
 * published. Photo editing arrives in T10, sections and home in T11, the Drive
 * import in T12.
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

      <p className="mt-10">
        <Link
          href="/admin/photos"
          className="t-credit link hover:text-text focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Editar fotografías →
        </Link>
      </p>

      <p className="t-intro text-muted mt-6">
        Organizar las secciones y la portada, e importar desde Drive, son las próximas tareas.
      </p>
    </>
  )
}
