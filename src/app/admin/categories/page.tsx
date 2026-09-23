import Link from 'next/link'
import type { Metadata } from 'next'
import { listCategoriesForHome } from '@/db/queries/admin'
import { requireAdmin } from '@/lib/auth'
import { publicUrl } from '@/lib/photo'
import { Back, BUTTON, Notice } from '../ui'
import { createCategory, saveHome } from './actions'
import { NewSection } from './new-section'
import { SectionOrder } from './reorder'

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
  const sections = await listCategoriesForHome()

  return (
    <>
      <Back />

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h1 className="t-section">Home</h1>
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
        Así queda la portada: las secciones en este orden y, al final, las recién añadidas, que
        aparecen solas. Una sección oculta no aparece en la portada ni en el menú, y no pierde
        ninguna fotografía.
      </p>

      {/* One form for the whole list: moving three secciones is one write. The
          order lives in `SectionOrder`, which submits it as a hidden position per
          row -- the cover and the name stay server-rendered and are handed to it. */}
      <form action={saveHome} className="mt-14">
        <h2 className="t-label border-rule border-b pb-2">Secciones</h2>

        <SectionOrder
          sections={sections.map((row) => ({
            id: row.id,
            name: row.name,
            visible: row.visible,
            row: (
              <>
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
              </>
            ),
          }))}
        />

        <div className="mt-6 flex flex-wrap items-baseline gap-4">
          <button type="submit" className={BUTTON}>
            Guardar cambios
          </button>
          <span className="t-meta">
            Se mueven arrastrando ⠿ o con las flechas. De arriba abajo, así salen en el home y en el
            menú.
          </span>
        </div>
      </form>

      <section className="mt-14">
        <h2 className="t-label border-rule border-b pb-2">Nueva sección</h2>
        <form action={createCategory} className="mt-5 grid max-w-lg gap-5">
          <NewSection />
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
