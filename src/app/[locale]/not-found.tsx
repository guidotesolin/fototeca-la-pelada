import type { Metadata } from 'next'
import { NotFoundMount, notFoundLocale, notFoundMetadata } from '@/components/not-found-mount'

/**
 * The archive's own 404, and it exists because deleting `app/layout.tsx` moved the
 * boundary.
 *
 * Next inserts a default not-found boundary at the **root layer** and at a first
 * layer that is a route *group*. `(public)` was a group, so before T13 the
 * archive had one inside its own header and footer, and the root layer had one
 * inside `<html lang="es">`. `[locale]` is a real segment rather than a group and
 * the root layout is gone, so the only remaining default boundary sat *above* the
 * public site's only `<html>`: every `notFound()` -- a mistyped permalink, a
 * gallery page past the end, a stale link off Facebook -- answered with Next's
 * bare fallback. Measured on the production build: `<html id="__next_error">`,
 * no `lang`, no stylesheet, no dark ground. Caught in review, not by a test.
 *
 * A file here puts the boundary back inside the public root layout, so a 404
 * renders as part of the archive again and in the reader's own language.
 *
 * It is only half of the answer: this catches what a page of the archive throws,
 * and an address the route tree never matched never reaches it. That one is
 * `app/not-found.tsx`, and the page both of them render is `NotFoundMount`.
 */
export async function generateMetadata(): Promise<Metadata> {
  return notFoundMetadata()
}

export default async function NotFound() {
  return <NotFoundMount locale={await notFoundLocale()} />
}
