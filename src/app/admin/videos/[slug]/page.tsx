import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getVideoForEdit, videoTranslations } from '@/db/queries/admin'
import { requireAdmin } from '@/lib/auth'
import { publicUrl } from '@/lib/photo'
import { videoWatchUrl } from '@/lib/url'
import { BUTTON, Back, CONTROL, FIELD, Field, Notice, Row } from '../../ui'
import { Submit } from '../../submit'
import { TakedownHelp } from '../../takedown-help'
import { TranslationsFor } from '../../translations/row'
import { TARGET_LOCALES } from '../../translations/items'
import { proposalsFor } from '../../translations/proposals'
import { saveVideo, setVideoPublished } from '../actions'

/**
 * One interview: its Spanish, its three languages, its place in the list, and
 * whether it is on the site.
 *
 * The same arrangement the section screen has, and for the same reason: one
 * Guardar writes the Spanish and the three translations in one transaction, so
 * the gesture is write, paste, press once.
 */
export async function generateMetadata(
  props: PageProps<'/admin/videos/[slug]'>,
): Promise<Metadata> {
  const { slug } = await props.params
  return { title: `Editar entrevista · ${slug}` }
}

export default async function AdminVideo(props: PageProps<'/admin/videos/[slug]'>) {
  await requireAdmin()
  const { slug } = await props.params
  const params = await props.searchParams

  const video = await getVideoForEdit(slug)
  if (!video) notFound()

  const stored = await videoTranslations(slug)
  const proposals = Object.fromEntries(TARGET_LOCALES.map((l) => [l, proposalsFor(l)]))

  return (
    <>
      <Back href="/admin/videos" label="Videoteca" />

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="t-section">{video.title ?? video.slug}</h1>
        {video.published ? (
          // A plain anchor, like every link from the panel to the site: a document
          // load has no client cache, and this link is for checking what changed.
          <a
            href={`/videoteca/${video.slug}`}
            className="t-credit link hover:text-text focus-visible:outline-focus underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Ver en el sitio ↗
          </a>
        ) : (
          <span className="t-label border-accent text-accent border px-2 py-1">sin publicar</span>
        )}
      </div>

      <Notice params={params} />

      {video.thumbKey && (
        <div className="mount mt-8 max-w-md">
          {/* The poster as the site serves it, from R2. If this square is empty
              the derivatives are gone and the page will be too. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={publicUrl(video.thumbKey)}
            alt=""
            className="block w-full"
            style={{ aspectRatio: '16 / 9', objectFit: 'cover' }}
          />
        </div>
      )}

      <form action={saveVideo} className="mt-10 flex max-w-2xl flex-col gap-6">
        <input type="hidden" name="slug" value={video.slug} />

        <Field label="Título" hint="En español, que es lo que se lee si falta la traducción.">
          <input
            name="title"
            required
            maxLength={120}
            defaultValue={video.title ?? ''}
            className={CONTROL}
          />
        </Field>

        <Field label="Descripción" hint="Opcional. Es lo que se lee debajo del video.">
          <textarea
            name="description"
            rows={5}
            maxLength={4000}
            defaultValue={video.description ?? ''}
            className={FIELD}
          />
        </Field>

        <Field label="Orden" hint="Más chico, más arriba en la Videoteca.">
          <input
            type="number"
            name="position"
            min={0}
            max={999999}
            step={1}
            defaultValue={video.position}
            className={`${CONTROL} w-28`}
          />
        </Field>

        {/* Inside this form and saved by the button below it. Two forms would mean
            pressing the lower one and losing the Spanish sitting unsent above. */}
        <TranslationsFor
          id={video.slug}
          kinds={['title', 'description']}
          source={{ title: video.title ?? '', description: video.description ?? '' }}
          stored={stored}
          proposals={proposals}
        />

        <Submit busy="Guardando…" className={BUTTON}>
          Guardar
        </Submit>
      </form>

      <section className="mt-14">
        <h2 className="t-label border-rule border-b pb-2">Publicación</h2>
        <p className="t-intro text-muted mt-4">
          {video.published
            ? 'Está publicada. Al despublicarla sale de la Videoteca y del sitemap, y su página pasa a contestar que fue retirada. El video sigue en YouTube y la miniatura queda guardada, así volver a publicarla es un solo clic.'
            : 'No está publicada: no aparece en la Videoteca y su página contesta que fue retirada. Al publicarla vuelve a estar en línea al instante.'}
        </p>
        <form action={setVideoPublished} className="mt-5">
          <input type="hidden" name="slug" value={video.slug} />
          <input type="hidden" name="published" value={video.published ? 'false' : 'true'} />
          <button type="submit" className={BUTTON}>
            {video.published ? 'Despublicar' : 'Publicar'}
          </button>
        </form>

        {/* Only while it is hidden, because only then is there anything left to do:
            its page answers 410 already, and Google still has to be told. */}
        {!video.published && <TakedownHelp path={`/videoteca/${video.slug}`} noun="entrevista" />}
      </section>

      <section className="mt-14">
        <h2 className="t-label border-rule border-b pb-2">Archivo</h2>
        <dl className="mt-2">
          <Row label="Identificador">{video.slug}</Row>
          <Row label="Video en YouTube">
            <a
              href={videoWatchUrl(video.youtubeId)}
              rel="noopener"
              className="link hover:text-text focus-visible:outline-focus underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {video.youtubeId} ↗
            </a>
          </Row>
          <Row label="Miniatura">
            {video.webWidth && video.webHeight
              ? `${video.webWidth} × ${video.webHeight}`
              : 'sin miniatura'}
          </Row>
        </dl>
        <p className="t-meta mt-4">
          El ID no se edita: es la dirección del video. Si hace falta cambiarlo, agregá la
          entrevista de nuevo y despublicá esta.
        </p>
      </section>
    </>
  )
}
