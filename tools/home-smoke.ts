/**
 * Smoke test for T11's acceptance criteria, run against a real server and the
 * real database:
 *
 * - creating a section makes its public route appear **with no deploy**;
 * - hiding one takes it out of the site without touching a single photograph;
 * - editing a piece of `site_text` changes the home page after revalidation;
 * - a hostile URL in a network link is refused, and the stored one is untouched;
 * - and every one of those writes is refused to somebody who is not an admin,
 *   because a server action is a POST endpoint with a public URL of its own.
 *
 * It posts to the actions the way a browser with **no JavaScript** does --
 * multipart, to the page's own URL, with the action's id as a field name -- which
 * is the same trick `auth-smoke.ts` uses and the reason neither needs a bundle.
 * The session cookie is minted the same way too: same secret, same salt, so the
 * panel cannot tell it from the one Google's callback would set.
 *
 * Everything it touches is put back: the section it creates is deleted, and the
 * site text and the sections' order and visibility are snapshotted first and
 * restored in a `finally`, whether it passes or not.
 *
 * Needs the app running, ideally the production build (`npm run build && npm run
 * start`) -- `next dev` re-renders everything on every request and hides exactly
 * the revalidation behaviour this is here to measure:
 *
 *   npm run home:smoke
 *   BASE_URL=http://localhost:3001 npm run home:smoke
 */
import assert from 'node:assert/strict'
import { and, asc, eq, like, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { encode } from 'next-auth/jwt'
import postgres from 'postgres'
import { POSTGRES_OPTIONS } from '../src/db/connect'
import {
  appUser,
  category,
  categoryTranslation,
  photo,
  photoCategory,
  siteText,
} from '../src/db/schema'

try {
  process.loadEnvFile('.env.local')
} catch {
  // Fine: the variables may come from the environment instead.
}

const { DATABASE_URL, AUTH_SECRET } = process.env
if (!DATABASE_URL || !AUTH_SECRET) {
  console.error('DATABASE_URL and AUTH_SECRET must be set: see .env.example.')
  process.exit(1)
}

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const EMAIL = 'home-smoke@example.invalid'

/** Over http the cookie carries no `__Secure-` prefix, and its name is the salt. */
const COOKIE = 'authjs.session-token'

/**
 * The section this test creates and deletes. **Stamped, so it is different every
 * run**, which is the whole point of the assertion that follows it: a slug reused
 * between runs would find last run's prerendered page still in `.next/cache` and
 * pass without the route ever having been rendered on demand. Named so that a
 * leftover from a run that died is obvious, and swept by prefix at both ends.
 */
const PREFIX = 't11-smoke-'
const SLUG = `${PREFIX}${Date.now().toString(36)}`
const NAME = `Sección de prueba T11 ${SLUG}`

/** The section it hides and unhides: a real one, so "without deleting its photos" means something. */
const HIDDEN = 'casamientos'

const client = postgres(DATABASE_URL, POSTGRES_OPTIONS)
const db = drizzle(client)

let checks = 0
function check(condition: boolean, message: string) {
  assert.ok(condition, message)
  checks++
}

async function get(path: string, cookie?: string) {
  const response = await fetch(new URL(path, BASE), {
    redirect: 'manual',
    headers: cookie ? { cookie: `${COOKIE}=${cookie}` } : {},
    cache: 'no-store',
  })
  return {
    status: response.status,
    location: response.headers.get('location'),
    body: await response.text(),
  }
}

/**
 * The action id Next renders as a hidden field's **name**, on the form carrying
 * `needle`. A raw substring rather than a field name, because two forms on the
 * section screen both carry `name="slug"` -- saving and deleting -- so the button's
 * own words are what tells them apart.
 */
function actionIdOn(html: string, needle: string): string {
  const form = html.split('<form').find((chunk) => chunk.includes(needle))
  const id = form?.match(/\$ACTION_ID_[a-f0-9]+/)?.[0]
  assert.ok(id, `no server action found on the form carrying ${needle}`)
  return id
}

/** What a browser with no JavaScript posts: multipart, to the page's own URL. */
async function post(
  path: string,
  actionId: string,
  fields: Record<string, string | string[]>,
  cookie?: string,
) {
  const body = new FormData()
  body.set(actionId, '')
  for (const [name, value] of Object.entries(fields)) {
    for (const one of Array.isArray(value) ? value : [value]) body.append(name, one)
  }
  const response = await fetch(new URL(path, BASE), {
    method: 'POST',
    redirect: 'manual',
    headers: cookie ? { cookie: `${COOKIE}=${cookie}` } : {},
    body,
  })
  return { status: response.status, location: response.headers.get('location') }
}

/**
 * The public site is served from a prerendered copy and revalidated with `'max'`,
 * which serves the old page while the new one renders behind it -- so a change is
 * not on the first request, and asserting on one would be asserting on luck. This
 * asks until it is there, and reports how many requests and how long it took.
 */
async function eventually(
  path: string,
  holds: (body: string, status: number) => boolean,
  what: string,
) {
  const started = Date.now()
  for (let attempt = 1; attempt <= 25; attempt++) {
    const page = await get(path)
    if (holds(page.body, page.status)) {
      console.log(`  ${what}: request ${attempt}, ${Date.now() - started} ms`)
      checks++
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  assert.fail(`${what}: still not true after 25 requests over ${Date.now() - started} ms`)
}

/** Set while the highlights strip is being exercised, so the `finally` can undo it. */
let featuredSubject: { id: number; featured: boolean } | null = null

/**
 * How the `finally` tells the site that the archive it is serving has changed.
 *
 * Putting the rows back is not enough: the public pages are prerendered, and the
 * restore below writes straight to the database, which no `revalidateTag` hears.
 * A run that ended here used to leave the home page serving the test's own title
 * and a section that no longer exists, for a day. So the restore finishes with one
 * harmless write **through the panel** -- the sections' own layout, saved exactly
 * as it was found -- purely for the revalidation that comes with it.
 */
let revalidate: (() => Promise<void>) | null = null

async function main() {
  // Snapshotted before anything is written, restored in the `finally` below.
  const textBefore = await db.select().from(siteText)
  const layoutBefore = await db
    .select({
      id: category.id,
      position: category.position,
      visible: category.visible,
      coverPhotoId: category.coverPhotoId,
    })
    .from(category)

  try {
    await db.delete(appUser).where(eq(appUser.email, EMAIL)) // a failed run must not block this one
    await db.delete(category).where(like(category.slug, `${PREFIX}%`))
    await db.insert(appUser).values({ email: EMAIL, name: 'Home Smoke' })
    const session = await encode({
      secret: AUTH_SECRET!,
      salt: COOKIE,
      token: { email: EMAIL, name: 'Home Smoke', sub: 'home-smoke' },
    })

    // --- 1. the two new screens are behind the gate, and reachable with a session ---
    for (const path of ['/admin/categories', '/admin/site-text']) {
      const anonymous = await get(path)
      check(anonymous.status === 307, `an anonymous GET ${path} is redirected by the server`)
      check(anonymous.location === '/admin/signin', `${path} sends it to the sign-in screen`)
      check(!anonymous.body.includes('Guardar'), `${path} sends no panel markup to a stranger`)
    }
    const portada = await get('/admin/categories', session)
    check(portada.status === 200, 'the portada screen is reachable with a session')
    const textos = await get('/admin/site-text', session)
    check(textos.status === 200, 'the site text screen is reachable with a session')

    const create = actionIdOn(portada.body, 'name="name"')
    const layout = actionIdOn(portada.body, 'name="visible"')
    const save = actionIdOn(textos.body, 'name="home_title"')

    revalidate = async () => {
      await post(
        '/admin/categories',
        layout,
        {
          id: layoutBefore.map((r) => String(r.id)),
          position: layoutBefore.map((r) => String(r.position)),
          visible: layoutBefore.filter((r) => r.visible).map((r) => String(r.id)),
        },
        session,
      )
    }

    // --- 2. the same writes, posted by somebody who is not signed in ---
    const refusedCreate = await post('/admin/categories', create, { name: 'x', slug: 'x' })
    check(refusedCreate.location === '/admin/signin', 'createCategory refuses an anonymous post')
    const refusedText = await post('/admin/site-text', save, { home_title: 'x' })
    check(refusedText.location === '/admin/signin', 'saveSiteText refuses an anonymous post')
    const [smuggled] = await db.select().from(category).where(eq(category.slug, 'x'))
    check(!smuggled, 'and the refused post wrote nothing')

    // --- 3. creating a section makes its public route appear, with no deploy ---
    const created = await post('/admin/categories', create, { name: NAME, slug: SLUG }, session)
    check(created.status === 303, 'a no-JavaScript post reaches the action')
    check(
      created.location === '/admin/categories?ok=seccion-creada',
      `the section was created (got ${created.location})`,
    )
    const [row] = await db.select().from(category).where(eq(category.slug, SLUG))
    check(!!row && row.visible, 'the row is there and visible')
    await eventually(
      `/categoria/${SLUG}`,
      (body, status) => status === 200 && body.includes(NAME),
      `/categoria/${SLUG} answers 200 with the section's name`,
    )
    await eventually('/', (body) => body.includes(NAME), 'the home page lists the new section')

    // A section whose address is already taken is refused rather than shadowing it.
    const twice = await post('/admin/categories', create, { name: NAME, slug: SLUG }, session)
    check(
      twice.location === '/admin/categories?error=direccion-repetida',
      'a repeated address is refused',
    )
    // And one that is not an address at all, which is what would reach an href.
    const malformed = await post(
      '/admin/categories',
      create,
      { name: NAME, slug: '../../etc/passwd' },
      session,
    )
    check(
      malformed.location === '/admin/categories?error=direccion',
      'a malformed address is refused',
    )

    // --- 4. hiding a section takes it off the site and keeps every photograph ---
    const rows = await db
      .select({ id: category.id, slug: category.slug, position: category.position })
      .from(category)
    const target = rows.find((r) => r.slug === HIDDEN)
    assert.ok(target, `the ${HIDDEN} section is missing from the archive`)
    const [{ photos: photosBefore }] = await db
      .select({ photos: sql<number>`count(*)::int` })
      .from(photoCategory)
      .where(eq(photoCategory.categoryId, target.id))
    check(photosBefore > 0, `${HIDDEN} has photographs to lose`)

    const hidden = await post(
      '/admin/categories',
      layout,
      {
        id: rows.map((r) => String(r.id)),
        position: rows.map((r) => String(r.position)),
        // Every id but the target's: an unchecked box sends nothing at all, which
        // is why visibility is read as the set that came back rather than row by row.
        visible: rows.filter((r) => r.id !== target.id).map((r) => String(r.id)),
      },
      session,
    )
    check(hidden.location === '/admin/categories?ok=portada', 'the layout was saved')
    await eventually(
      '/',
      (body) => !body.includes(`/categoria/${HIDDEN}`),
      `${HIDDEN} is gone from the home page and the menu`,
    )
    const [{ photos: photosAfter }] = await db
      .select({ photos: sql<number>`count(*)::int` })
      .from(photoCategory)
      .where(eq(photoCategory.categoryId, target.id))
    check(photosAfter === photosBefore, `and its ${photosBefore} photographs are all still there`)

    // --- 5. editing site text changes the home page ---
    // Every field is posted, because the action is the whole form: a key that
    // arrives empty is a key they cleared, and it is deleted rather than blanked.
    const current = Object.fromEntries(
      (await db.select().from(siteText).where(eq(siteText.locale, 'es'))).map((r) => [
        r.key,
        r.value,
      ]),
    )
    const stamped = `Archivo de prueba T11 ${Date.now()}`
    const saved = await post('/admin/site-text', save, { ...current, home_title: stamped }, session)
    check(saved.location === '/admin/site-text?ok=textos', 'the site text was saved')
    await eventually('/', (body) => body.includes(stamped), 'the home page shows the new title')

    // --- 5b. the highlights strip, which is F14 and had no data to be tested on ---
    // `featured` is flipped in the database rather than through the photo screen,
    // because `saveDetails` is the whole form and resending a caption to set a
    // checkbox is how a caption gets lost. The revalidation comes from a panel
    // write either way -- the layout save below, which changes nothing.
    const [subject] = await db
      .select({ id: photo.id, slug: photo.slug, featured: photo.featured })
      .from(photo)
      .innerJoin(photoCategory, eq(photoCategory.photoId, photo.id))
      .innerJoin(
        category,
        and(eq(category.id, photoCategory.categoryId), eq(category.visible, true)),
      )
      .where(and(eq(photo.published, true), sql`${photo.webKey} is not null`))
      .orderBy(asc(category.position), asc(photoCategory.position))
      .limit(1)
    assert.ok(subject, 'no published photograph to feature')
    featuredSubject = { id: subject.id, featured: subject.featured }

    const sameLayout = {
      id: rows.map((r) => String(r.id)),
      position: rows.map((r) => String(r.position)),
      visible: rows.filter((r) => r.id !== target.id).map((r) => String(r.id)),
    }
    await db.update(photo).set({ featured: true }).where(eq(photo.id, subject.id))
    check(
      (await post('/admin/categories', layout, sameLayout, session)).location ===
        '/admin/categories?ok=portada',
      'a panel write revalidates the home page',
    )
    await eventually(
      '/',
      (body) => body.includes('Destacadas') && body.includes(`/foto/${subject.slug}`),
      `the home page shows ${subject.slug} in the highlights strip`,
    )

    await db.update(photo).set({ featured: subject.featured }).where(eq(photo.id, subject.id))
    check(
      (await post('/admin/categories', layout, sameLayout, session)).location ===
        '/admin/categories?ok=portada',
      'and the flag goes back the way it came',
    )
    await eventually(
      '/',
      (body) => !body.includes('Destacadas'),
      'with nothing featured the strip is not on the page at all',
    )

    // --- 5c. saving a section does not silently drop its cover photograph ---
    // The picker only offers published photographs, so a section whose cover has
    // been taken down renders with **no radio checked at all** -- and a browser
    // submits no field for that. Read as "no cover" it cleared the choice on a
    // save that never touched it, which is a curatorial decision lost in silence.
    const [before] = await db
      .select({
        id: category.id,
        coverPhotoId: category.coverPhotoId,
        name: categoryTranslation.name,
      })
      .from(category)
      .innerJoin(
        categoryTranslation,
        and(eq(categoryTranslation.categoryId, category.id), eq(categoryTranslation.locale, 'es')),
      )
      .where(eq(category.slug, HIDDEN))
      .limit(1)
    assert.ok(before?.coverPhotoId, `${HIDDEN} has no cover photograph to keep`)

    const sectionScreen = await get(`/admin/categories/${HIDDEN}`, session)
    const saveSection = actionIdOn(sectionScreen.body, 'name="intro"')

    // Exactly what the form posts when nothing is checked: no coverPhotoId key.
    const untouched = await post(
      `/admin/categories/${HIDDEN}`,
      saveSection,
      { slug: HIDDEN, name: before.name, intro: '' },
      session,
    )
    check(
      untouched.location === `/admin/categories/${HIDDEN}?ok=seccion-guardada`,
      'a save with no cover field is accepted',
    )
    const [after] = await db
      .select({ coverPhotoId: category.coverPhotoId })
      .from(category)
      .where(eq(category.id, before.id))
    check(
      after.coverPhotoId === before.coverPhotoId,
      'and it left the cover photograph alone: absent is not the same as empty',
    )

    // The "Ninguna" radio, which is the only thing that may clear it.
    const cleared = await post(
      `/admin/categories/${HIDDEN}`,
      saveSection,
      { slug: HIDDEN, name: before.name, intro: '', coverPhotoId: '' },
      session,
    )
    check(
      cleared.location === `/admin/categories/${HIDDEN}?ok=seccion-guardada`,
      'the "Ninguna" option is accepted',
    )
    const [none] = await db
      .select({ coverPhotoId: category.coverPhotoId })
      .from(category)
      .where(eq(category.id, before.id))
    check(none.coverPhotoId === null, 'and that, and only that, clears it')

    // A photograph from another section cannot be made this one's cover.
    const [outsider] = await db
      .select({ id: photoCategory.photoId })
      .from(photoCategory)
      .where(sql`${photoCategory.categoryId} <> ${before.id}`)
      .limit(1)
    const foreign = await post(
      `/admin/categories/${HIDDEN}`,
      saveSection,
      { slug: HIDDEN, name: before.name, intro: '', coverPhotoId: String(outsider.id) },
      session,
    )
    check(
      foreign.location === `/admin/categories/${HIDDEN}?error=portada`,
      'a photograph from another section is refused as a cover',
    )

    // --- 6. a hostile URL in a network link is refused, and nothing is stored ---
    // The shapes that fool a check written as a substring. Same family as
    // `url:smoke`, which covers the guards; this covers the wiring.
    //
    // The map used to be checked here too, and is not any more: its field is gone
    // from the panel, so nothing writes `map_embed_url` and there is no wiring
    // left on this side to have. The home page still renders whatever row is
    // stored, and still through `mapEmbedUrl`, which is the check that matters
    // now -- `url:smoke` is what covers that guard.
    const hostile = [
      ['javascript:alert(document.cookie)', 'a scheme that executes'],
      ['//www.instagram.com/fototeca.lp', 'a protocol-relative address'],
      ['http://www.instagram.com/fototeca.lp', 'a downgrade to http'],
    ] as const
    for (const [url, why] of hostile) {
      const refused = await post(
        '/admin/site-text',
        save,
        { ...current, home_title: stamped, instagram_url: url },
        session,
      )
      check(
        refused.location === '/admin/site-text?error=url-red',
        `a network link refuses ${why} (${url})`,
      )
      // The whole form is validated before anything is written, so a refusal
      // leaves the ten other fields as they were as well as this one.
      const [stored] = await db
        .select({ value: siteText.value })
        .from(siteText)
        .where(and(eq(siteText.key, 'instagram_url'), eq(siteText.locale, 'es')))
      check(
        stored?.value === current.instagram_url,
        'and the link that was already there is untouched',
      )
    }
    // The one it must accept, so the rejections above are a guard and not a wall.
    const accepted = await post(
      '/admin/site-text',
      save,
      { ...current, home_title: stamped, instagram_url: current.instagram_url },
      session,
    )
    check(accepted.location === '/admin/site-text?ok=textos', 'a real profile URL is saved')

    // --- 7. a section with photographs is not deleted ---
    const section = await get(`/admin/categories/${HIDDEN}`, session)
    check(section.status === 200, 'the section screen is reachable')
    const remove = actionIdOn(section.body, 'Borrar sección')
    const kept = await post(`/admin/categories/${HIDDEN}`, remove, { slug: HIDDEN }, session)
    check(
      kept.location === `/admin/categories/${HIDDEN}?error=con-fotos`,
      'a section that still holds photographs refuses to be deleted',
    )
    const [{ photos: photosStill }] = await db
      .select({ photos: sql<number>`count(*)::int` })
      .from(photoCategory)
      .where(eq(photoCategory.categoryId, target.id))
    check(photosStill === photosBefore, 'and not one relation row was dropped on the way')

    // The empty one it created goes, which is the other half of the same rule.
    const gone = await post(`/admin/categories/${SLUG}`, remove, { slug: SLUG }, session)
    check(gone.location === '/admin/categories?ok=seccion-borrada', 'an empty section is deleted')
    const [left] = await db.select().from(category).where(eq(category.slug, SLUG))
    check(!left, 'and it is gone from the database')

    // --- 8. the case T9 says matters most: the cookie stays valid, the row goes ---
    // A check made only when the session was minted would leave a removed
    // administrator writing to the archive for the thirty days the JWT lives.
    // Last, because it takes the session away.
    await db.delete(appUser).where(eq(appUser.email, EMAIL))
    for (const [what, path, action, fields] of [
      ['createCategory', '/admin/categories', create, { name: NAME, slug: SLUG }],
      ['saveHome', '/admin/categories', layout, { id: '1', position: '1' }],
      ['saveSiteText', '/admin/site-text', save, { home_title: 'revocado' }],
      ['deleteCategory', `/admin/categories/${HIDDEN}`, remove, { slug: HIDDEN }],
    ] as const) {
      const revoked = await post(path, action, fields, session)
      check(revoked.location === '/admin/signin', `${what} refuses a revoked administrator`)
    }
    const [smuggledLate] = await db.select().from(category).where(eq(category.slug, SLUG))
    check(!smuggledLate, 'and none of those four posts wrote anything')
    // Back on the allowlist, because the restore below needs one write through
    // the panel to tell the site that the archive it is serving has changed.
    await db.insert(appUser).values({ email: EMAIL, name: 'Home Smoke' })

    console.log(`\nhome smoke ok: ${checks} checks pass`)
  } finally {
    /**
     * Put the archive back exactly as it was found, pass or fail -- **in one
     * transaction**, because the site text is restored by emptying the table and
     * reinserting the snapshot. As two statements against the real database that
     * is a window in which the archive has no words at all: every one of those
     * values renders conditionally, so the home page would quietly lose its
     * title, its intro and its map, and the footer the rights notice, the
     * contact and the networks, with nothing throwing to say so. This block runs
     * on the failure path by design, which is exactly when it is likeliest to be
     * interrupted.
     */
    await db.transaction(async (tx) => {
      await tx.delete(category).where(like(category.slug, `${PREFIX}%`))
      for (const row of layoutBefore) {
        await tx
          .update(category)
          .set({ position: row.position, visible: row.visible, coverPhotoId: row.coverPhotoId })
          .where(eq(category.id, row.id))
      }
      if (featuredSubject) {
        await tx
          .update(photo)
          .set({ featured: featuredSubject.featured })
          .where(eq(photo.id, featuredSubject.id))
      }
      await tx.delete(siteText)
      if (textBefore.length) await tx.insert(siteText).values(textBefore)
    })
    // Last, and before the session is taken away: the site is still serving the
    // pages this test made, and only a write through the panel drops them.
    if (revalidate) {
      try {
        await revalidate()
      } catch (error) {
        console.error('the site could not be told to revalidate; it will catch up in a day:', error)
      }
    }
    await db.delete(appUser).where(eq(appUser.email, EMAIL))
    await client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
