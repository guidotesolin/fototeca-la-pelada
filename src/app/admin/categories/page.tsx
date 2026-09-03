import Link from 'next/link'
import type { Metadata } from 'next'
import { listCategoriesForHome, listFeaturedForAdmin } from '@/db/queries/admin'
import { requireAdmin } from '@/lib/auth'
import { publicUrl } from '@/lib/photo'
import { BUTTON, FIELD, Field, Notice } from '../ui'
import { createCategory, saveHome } from './actions'

/**
 * The portada: how the home page is going to come out, and the controls that
 * decide it. The two halves of it are the two things the home page is made of --
 * the sections, in order, each with the photograph that represents it, and the
 * strip of highlights above them.
 *
 * Hidden sections are listed here and nowhere on the site, which is the point:
 * this is the screen where you put one back.
 *
 * Spanish, and never translated: only the two of them use it.
 */
export const metadata: Metadata = { title: 'Editar secciones' }

export default async function AdminCategories(props: PageProps<'/admin/categories'>) {
  await requireAdmin()
  const params = await props.searchParams
  const [sections, featured] = await Promise.all([listCategoriesForHome(), listFeaturedForAdmin()])

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h1 className="t-section">Portada</h1>
        {/* A plain anchor: Next keeps a statically generated page in the client for
            five minutes, and this link exists to check what was just changed. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          className="t-credit link hover:text-text focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Ver la portada
        </a>
      </div>

      <Notice params={params} />

      <p className="t-intro text-muted mt-6">
        Así queda la portada: primero las destacadas, después las secciones en este orden. Una
        sección oculta no aparece en la portada ni en el menú, y no pierde ninguna fotografía.
      </p>

      <section className="mt-12">
        <h2 className="t-label border-rule border-b pb-2">
          Destacadas · {featured.length} {featured.length === 1 ? 'fotografía' : 'fotografías'}
        </h2>
        {featured.length === 0 ? (
          <p className="t-meta mt-4">
            Todavía no hay ninguna. Se marcan una por una, en{' '}
            <Link href="/admin/photos" className="link text-accent hover:text-text">
              Fotografías
            </Link>
            , con la casilla «Destacada».
          </p>
        ) : (
          <ul className="mt-5 flex flex-wrap gap-3">
            {featured.map((row) => (
              <li key={row.slug}>
                <Link
                  href={`/admin/photos/${row.slug}`}
                  title={row.caption ?? row.slug}
                  className="focus-visible:outline-focus relative block focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {row.thumbKey ? (
                    // The panel is not a page we optimize: the thumbnails R2 has.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={publicUrl(row.thumbKey)}
                      alt=""
                      width={88}
                      height={88}
                      loading="lazy"
                      decoding="async"
                      className="mount h-22 w-22 object-cover"
                    />
                  ) : (
                    <span className="bg-surface text-muted flex h-22 w-22 items-center justify-center text-center font-sans text-[10px] leading-tight">
                      sin publicar
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {featured.some((row) => !row.published) && (
          <p className="t-meta mt-4">
            Alguna está marcada como destacada pero sin publicar, así que en la portada no aparece.
          </p>
        )}
      </section>

      {/* One form for the whole list: moving three secciones is one write, and the
          numbers work with JavaScript off and on a phone. */}
      <form action={saveHome} className="mt-14">
        <h2 className="t-label border-rule border-b pb-2">Secciones</h2>

        <ul className="border-rule mt-1 border-t">
          {sections.map((row) => (
            <li
              key={row.slug}
              className="border-rule flex items-center gap-4 border-b py-3 sm:gap-5"
            >
              <Link
                href={`/admin/categories/${row.slug}`}
                className="focus-visible:outline-focus shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {row.coverThumbKey ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={publicUrl(row.coverThumbKey)}
                    alt=""
                    width={64}
                    height={64}
                    loading="lazy"
                    decoding="async"
                    className="h-16 w-16 object-cover"
                  />
                ) : (
                  <span className="bg-surface text-muted flex h-16 w-16 items-center justify-center text-center font-sans text-[10px] leading-tight">
                    sin portada
                  </span>
                )}
              </Link>

              <div className="min-w-0 grow">
                <Link
                  href={`/admin/categories/${row.slug}`}
                  className="link hover:text-accent focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <span className="t-caption-grid block max-w-none truncate">{row.name}</span>
                </Link>
                <span className="t-meta mt-0.5 block truncate">
                  /categoria/{row.slug} · {row.photos}{' '}
                  {row.photos === 1 ? 'fotografía' : 'fotografías'}
                  {row.unpublished > 0 && ` · ${row.unpublished} sin publicar`}
                </span>
              </div>

              <input type="hidden" name="id" value={String(row.id)} />

              <label className="flex shrink-0 items-center gap-2">
                <input
                  type="checkbox"
                  name="visible"
                  value={String(row.id)}
                  defaultChecked={row.visible}
                  className="accent-accent focus-visible:outline-focus h-4 w-4 focus-visible:outline-2 focus-visible:outline-offset-2"
                />
                <span className="t-label">Se ve</span>
              </label>

              <label className="shrink-0">
                <span className="sr-only">Posición de {row.name}</span>
                <input
                  type="number"
                  name="position"
                  min={0}
                  max={999999}
                  step={1}
                  defaultValue={row.position}
                  className={`${FIELD} w-20 text-right`}
                />
              </label>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-wrap items-baseline gap-4">
          <button type="submit" className={BUTTON}>
            Guardar portada
          </button>
          <span className="t-meta">
            El número decide el orden en la portada y en el menú, de menor a mayor.
          </span>
        </div>
      </form>

      <section className="mt-14">
        <h2 className="t-label border-rule border-b pb-2">Nueva sección</h2>
        <form action={createCategory} className="mt-5 grid max-w-lg gap-5">
          <Field label="Nombre" hint="Como se lee en la portada y en el menú.">
            <input type="text" name="name" required maxLength={120} className={FIELD} />
          </Field>
          <Field
            label="Dirección"
            hint="La parte que va en /categoria/… Sólo minúsculas, números y guiones. No se puede cambiar después, porque es el enlace que la gente comparte."
          >
            <input
              type="text"
              name="slug"
              required
              maxLength={64}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              placeholder="fiestas-patronales"
              className={FIELD}
            />
          </Field>
          <button type="submit" className={`${BUTTON} justify-self-start`}>
            Crear sección
          </button>
        </form>
        <p className="t-meta mt-4 max-w-lg">
          Nace vacía y visible: su página en el sitio queda hecha en el momento, sin esperar nada.
        </p>
      </section>

      <p className="mt-14">
        <Link
          href="/admin/site-text"
          className="t-credit link hover:text-text focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Editar los textos del sitio →
        </Link>
      </p>
    </>
  )
}
