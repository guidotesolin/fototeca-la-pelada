import Link from 'next/link'
import type { Metadata } from 'next'
import { listVideosForAdmin } from '@/db/queries/admin'
import { requireAdmin } from '@/lib/auth'
import { publicUrl } from '@/lib/photo'
import { BUTTON, Back, CONTROL, FIELD, Field, Notice } from '../ui'
import { Submit } from '../submit'
import { createVideo } from './actions'

/**
 * The Videoteca as a list, plus the one form that adds to it.
 *
 * Hidden interviews are here too and say so: this is the screen you open to find
 * out what is actually in the database, which is the opposite promise from the
 * public list. Order and the Spanish text are edited on each interview's own
 * screen -- with three of them, a bulk order form would be a second way to reach
 * something one click already reaches.
 */
export const metadata: Metadata = { title: 'Videoteca' }

export default async function AdminVideos(props: PageProps<'/admin/videos'>) {
  await requireAdmin()
  const params = await props.searchParams
  const videos = await listVideosForAdmin()

  return (
    <>
      <Back />

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="t-section">Videoteca</h1>
        {videos.some((v) => v.published) && (
          // A plain anchor and not a `Link`: Next keeps a statically generated
          // page in the client for five minutes, and this link exists precisely
          // to check what was just changed.
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          <a
            href="/videoteca"
            className="t-credit link hover:text-text focus-visible:outline-focus underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Ver la Videoteca ↗
          </a>
        )}
      </div>

      <p className="t-intro text-muted mt-4">
        Las entrevistas a vecinas y vecinos, que se ven en{' '}
        <span className="text-text">fototecalapelada.com.ar/videoteca</span>. El video se queda en
        YouTube: acá se guardan su ID, el título en cada idioma y el orden.
      </p>

      <Notice params={params} />

      {videos.length === 0 ? (
        <p className="t-intro text-muted mt-8">Todavía no hay ninguna entrevista.</p>
      ) : (
        <ul className="mt-8 flex flex-col">
          {videos.map((video) => (
            <li key={video.slug} className="border-rule border-t last:border-b">
              <Link
                href={`/admin/videos/${video.slug}`}
                className="hover:bg-surface-high focus-visible:outline-focus flex items-center gap-4 px-2 py-3 focus-visible:outline-2 focus-visible:-outline-offset-2"
              >
                {video.thumbKey ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={publicUrl(video.thumbKey)}
                    alt=""
                    width={80}
                    height={45}
                    className="bg-surface h-[45px] w-20 shrink-0 object-cover"
                  />
                ) : (
                  <span className="bg-surface h-[45px] w-20 shrink-0" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="t-credit text-text block truncate">
                    {video.title ?? video.slug}
                  </span>
                  <span className="t-meta mt-0.5 block">
                    {video.slug} · {video.youtubeId}
                  </span>
                </span>
                {!video.published && (
                  <span className="t-label border-accent text-accent shrink-0 border px-2 py-1">
                    sin publicar
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-14">
        <h2 className="t-label border-rule border-b pb-2">Agregar una entrevista</h2>
        <form action={createVideo} className="mt-5 flex max-w-xl flex-col gap-5">
          <Field
            label="ID del video en YouTube"
            hint="Son 11 caracteres: lo que va después de «v=» en la dirección. En youtube.com/watch?v=yJ4sZrsuzyw el ID es yJ4sZrsuzyw."
          >
            <input
              name="youtubeId"
              required
              maxLength={11}
              minLength={11}
              /* A hint for the browser and never a check: `isYoutubeId` on the
                 server decides, and it sees whatever was actually sent. The dash
                 is escaped because `pattern` is compiled with the `v` flag, where
                 a bare `-` inside a class is a syntax error -- Chrome then throws
                 the whole pattern away and logs it, so the hint was dead and the
                 console was not clean. */
              pattern="[A-Za-z0-9_\-]{11}"
              placeholder="yJ4sZrsuzyw"
              className={`${CONTROL} font-mono`}
            />
          </Field>

          <Field label="Título" hint="En español. Los otros idiomas se cargan después.">
            <input name="title" required maxLength={120} className={CONTROL} />
          </Field>

          <Field label="Descripción" hint="Opcional.">
            <textarea name="description" rows={4} maxLength={4000} className={FIELD} />
          </Field>

          <p className="t-meta">
            Al agregarla se baja la miniatura del video una sola vez y queda guardada en el archivo,
            así la página no le pide nada a Google hasta que alguien toca reproducir.
          </p>

          <Submit busy="Agregando…" className={BUTTON}>
            Agregar
          </Submit>
        </form>
      </section>
    </>
  )
}
