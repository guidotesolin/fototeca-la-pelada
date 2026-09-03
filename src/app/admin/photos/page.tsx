import Link from 'next/link'
import type { Metadata } from 'next'
import { ADMIN_PER_PAGE, FILTERS, isFilter, listCategories, listPhotos } from '@/db/queries/admin'
import { requireAdmin } from '@/lib/auth'
import { publicUrl } from '@/lib/photo'
import { BUTTON, CONTROL, FIELD, Notice, one } from '../ui'
import { saveOrder } from './actions'

/**
 * The archive as a working list: 592 rows is too many to scroll, so the screen is
 * a filter and a page of results. Narrowed to a section it comes back in
 * curatorial order and every row grows a position box, which is how reordering
 * works here -- no dragging, no library, and it works with JavaScript off.
 *
 * Spanish, and never translated: only the two of them use it.
 */

export const metadata: Metadata = { title: 'Editar fotos' }

export default async function AdminPhotos(props: PageProps<'/admin/photos'>) {
  await requireAdmin()
  const params = await props.searchParams

  const q = one(params.q).slice(0, 100)
  const section = one(params.seccion)
  const filterParam = one(params.filtro)
  const filter = isFilter(filterParam) ? filterParam : 'todas'
  const page = Math.max(1, Number(one(params.p)) || 1)

  const [categories, { rows, total }] = await Promise.all([
    listCategories(),
    listPhotos({ q, section, filter, page }),
  ])

  const sectionExists = categories.some((c) => c.slug === section)

  // A section is listed whole so its order can be saved in one form: no pages.
  const pages = sectionExists ? 1 : Math.max(1, Math.ceil(total / ADMIN_PER_PAGE))
  /** Keeps the filters when paging, without carrying the outcome of the last write. */
  const href = (to: number) => {
    const query = new URLSearchParams()
    if (q) query.set('q', q)
    if (section) query.set('seccion', section)
    if (filter !== 'todas') query.set('filtro', filter)
    if (to > 1) query.set('p', String(to))
    const string = query.toString()
    return string ? `/admin/photos?${string}` : '/admin/photos'
  }

  return (
    <>
      <h1 className="t-section">Fotografías</h1>

      <Notice params={params} />
      <form method="get" className="mt-8 flex flex-wrap items-end gap-3">
        <label className="grow basis-56">
          <span className="t-label block pb-1.5">Buscar</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="epígrafe, cortesía o identificador"
            className={CONTROL}
          />
        </label>
        <label className="grow basis-40">
          <span className="t-label block pb-1.5">Sección</span>
          <select name="seccion" defaultValue={section} className={CONTROL}>
            <option value="">Todas</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grow basis-40">
          <span className="t-label block pb-1.5">Estado</span>
          <select name="filtro" defaultValue={filter} className={CONTROL}>
            {Object.entries(FILTERS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={BUTTON}>
          Filtrar
        </button>
      </form>

      <p className="t-meta mt-6">
        {total} {total === 1 ? 'fotografía' : 'fotografías'}
        {pages > 1 && ` · página ${page} de ${pages}`}
      </p>

      {/* The whole page of rows is one form when a section is chosen: the position
          boxes are saved together, so moving three photographs is one write. */}
      <form action={saveOrder} className="mt-4">
        <input type="hidden" name="section" value={section} />
        <input type="hidden" name="page" value={String(page)} />

        <ul className="border-rule border-t">
          {rows.map((row) => (
            <li
              key={row.slug}
              className="border-rule flex items-center gap-4 border-b py-3 sm:gap-5"
            >
              <Link
                href={`/admin/photos/${row.slug}`}
                className="focus-visible:outline-focus shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {row.thumbKey ? (
                  // The panel is not a page we optimize: these are the thumbnails R2
                  // already has, at the size they are already stored in.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={publicUrl(row.thumbKey)}
                    alt=""
                    width={64}
                    height={64}
                    loading="lazy"
                    decoding="async"
                    className="h-16 w-16 object-cover"
                  />
                ) : (
                  <span className="bg-surface text-muted flex h-16 w-16 items-center justify-center text-center font-sans text-[10px] leading-tight">
                    sin derivadas
                  </span>
                )}
              </Link>

              <div className="min-w-0 grow">
                <Link
                  href={`/admin/photos/${row.slug}`}
                  className="link hover:text-accent focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <span className="t-caption-grid block max-w-none truncate">
                    {row.caption ?? <span className="text-muted italic">Sin epígrafe</span>}
                  </span>
                </Link>
                <span className="t-meta mt-0.5 block truncate">
                  {row.slug}
                  {row.credit && ` · ${row.credit}`}
                </span>
              </div>

              <span className="t-label hidden shrink-0 gap-2 sm:flex">
                {!row.published && <Tag>sin publicar</Tag>}
                {row.sensitive && <Tag>sensible</Tag>}
                {row.featured && <Tag>destacada</Tag>}
                {row.restored && <Tag>restaurada</Tag>}
              </span>

              {sectionExists && (
                <>
                  <input type="hidden" name="id" value={String(row.id)} />
                  <label className="shrink-0">
                    <span className="sr-only">Posición de {row.slug}</span>
                    <input
                      type="number"
                      name="position"
                      min={0}
                      max={999999}
                      step={1}
                      defaultValue={row.position ?? 0}
                      className={`${FIELD} w-20 text-right`}
                    />
                  </label>
                </>
              )}
            </li>
          ))}
        </ul>

        {rows.length === 0 && (
          <p className="t-intro text-muted mt-6">Ninguna fotografía coincide con ese filtro.</p>
        )}

        {sectionExists && rows.length > 0 && (
          <div className="mt-6 flex flex-wrap items-baseline gap-4">
            <button type="submit" className={BUTTON}>
              Guardar orden
            </button>
            <span className="t-meta">
              El número decide el orden dentro de la sección, de menor a mayor.
            </span>
          </div>
        )}
      </form>

      {pages > 1 && (
        <nav
          aria-label="Paginación"
          className="border-rule mt-10 flex items-baseline justify-between gap-4 border-t pt-6"
        >
          <span>
            {page > 1 && (
              <Link href={href(page - 1)} className="t-credit link hover:text-text py-2">
                ← Anterior
              </Link>
            )}
          </span>
          <span>
            {page < pages && (
              <Link href={href(page + 1)} className="t-credit link hover:text-text py-2">
                Siguiente →
              </Link>
            )}
          </span>
        </nav>
      )}
    </>
  )
}

function Tag({ children }: { children: string }) {
  return <span className="border-rule text-muted border px-2 py-1">{children}</span>
}
