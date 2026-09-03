/**
 * Smoke test for the panel's boundary, which is the whole of T9's acceptance:
 * authorization is checked on the server on every request, and hiding the UI is
 * not authorization.
 *
 * It mints a real Auth.js session cookie -- same secret, same salt, same
 * encryption as the one Google's callback would set -- so the interesting cases
 * can be exercised without an OAuth round trip. The case that matters is the
 * fourth: the cookie stays valid and the row leaves `app_user`, which is what
 * revoking an administrator actually looks like. A panel that only checked the
 * allowlist when the cookie was minted would still let that request in, for the
 * thirty days the JWT lives.
 *
 * Needs the app running (`npm run start` or `npm run dev`):
 *
 *   npm run auth:smoke
 *   BASE_URL=http://localhost:3001 npm run auth:smoke
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { encode } from 'next-auth/jwt'
import postgres from 'postgres'
import { POSTGRES_OPTIONS } from '../src/db/connect'
import { appUser, category, photo } from '../src/db/schema'

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
const EMAIL = 'auth-smoke@example.invalid'

/** Over http the cookie carries no `__Secure-` prefix, and its name is the salt. */
const COOKIE = 'authjs.session-token'

const client = postgres(DATABASE_URL, POSTGRES_OPTIONS)
const db = drizzle(client)

/** What the panel answers to a GET on `path`, without following the redirect. */
async function get(path: string, cookie?: string) {
  const response = await fetch(new URL(path, BASE), {
    redirect: 'manual',
    headers: cookie ? { cookie: `${COOKIE}=${cookie}` } : {},
  })
  return {
    status: response.status,
    location: response.headers.get('location'),
    body: await response.text(),
  }
}

/**
 * The hidden field Next renders so a form that calls a server action still works
 * with JavaScript off: the action's id is the field's **name**. Scraping it is
 * how this file can post to an action the way a browser does, without a bundle.
 */
function actionIdOn(html: string, field: string): string {
  const form = html.split('<form').find((chunk) => chunk.includes(`name="${field}"`))
  const id = form?.match(/\$ACTION_ID_[a-f0-9]+/)?.[0]
  assert.ok(id, `no server action found on the form carrying ${field}`)
  return id
}

/** What a browser with no JavaScript posts to a server action: multipart, to the page's own URL. */
async function postAction(
  path: string,
  actionId: string,
  fields: Record<string, string>,
  cookie?: string,
) {
  const body = new FormData()
  body.set(actionId, '')
  for (const [name, value] of Object.entries(fields)) body.set(name, value)
  const response = await fetch(new URL(path, BASE), {
    method: 'POST',
    redirect: 'manual',
    headers: cookie ? { cookie: `${COOKIE}=${cookie}` } : {},
    body,
  })
  return { status: response.status, location: response.headers.get('location') }
}

async function main() {
  try {
    await db.delete(appUser).where(eq(appUser.email, EMAIL)) // a failed run must not block this one
    await db.insert(appUser).values({ email: EMAIL, name: 'Auth Smoke' })

    const session = await encode({
      secret: AUTH_SECRET!,
      salt: COOKIE,
      token: { email: EMAIL, name: 'Auth Smoke', sub: 'auth-smoke' },
    })

    // --- 1. anonymous: the server redirects, and sends none of the panel ---
    const anonymous = await get('/admin')
    assert.equal(anonymous.status, 307, 'an anonymous GET /admin is redirected by the server')
    assert.equal(anonymous.location, '/admin/signin')
    assert.ok(
      !anonymous.body.includes('Cerrar sesión'),
      'and the response body carries no panel markup: this is the difference between ' +
        'authorization and a hidden link',
    )

    // --- 2. on the allowlist: in, and the page knows who it is ---
    const allowed = await get('/admin', session)
    assert.equal(allowed.status, 200, 'an allowlisted session reaches the panel')
    assert.ok(allowed.body.includes(EMAIL), 'and the header shows the address that was let in')

    // --- 3. the sign-in screen is not a dead end for someone already in ---
    const signin = await get('/admin/signin', session)
    assert.equal(signin.status, 307, 'a signed-in administrator is sent on from /admin/signin')
    assert.equal(signin.location, '/admin')

    // --- 4. revoked, same cookie: the point of checking per request ---
    await db.delete(appUser).where(eq(appUser.email, EMAIL))
    const revoked = await get('/admin', session)
    assert.equal(
      revoked.status,
      307,
      'the same still-valid cookie is refused once the row is gone: the allowlist is ' +
        'read on every request, not only when the session was minted',
    )
    assert.equal(revoked.location, '/admin/signin')

    // --- 5. a forged cookie is not a session ---
    await db.insert(appUser).values({ email: EMAIL, name: 'Auth Smoke' })
    const forged = await get('/admin', session.slice(0, -4) + 'aaaa')
    assert.equal(forged.status, 307, 'a tampered cookie does not decrypt, so it is nobody')
    assert.equal(forged.location, '/admin/signin')

    // --- 6. and the way in is reachable without a session ---
    const door = await get('/admin/signin')
    assert.equal(door.status, 200, 'the sign-in screen is public')
    assert.ok(door.body.includes('Entrar con Google'), 'and offers the one way in')

    // --- 7. an outage and a rejection do not read the same ---
    // Auth.js reports anything thrown in the `signIn` callback as AccessDenied,
    // so the two have to arrive as different codes. This covers the half a
    // request can see; the `catch` that produces it needs a real outage.
    const outage = await get('/admin/signin?error=Unavailable')
    assert.ok(
      outage.body.includes('No pudimos verificar'),
      'a failed allowlist lookup says so, instead of telling an administrator they are not one',
    )
    assert.ok(
      !outage.body.includes('no tiene acceso al panel'),
      'and it does not also render the rejection',
    )

    // --- 8. the three kinds of "no" stay apart ---
    // A person who cancels on Google's account chooser arrives as
    // OAuthCallbackError, and an unrecognised code must not claim the
    // deployment is broken either: only `Configuration` gets to say that.
    const cancelled = await get('/admin/signin?error=OAuthCallbackError')
    assert.ok(
      cancelled.body.includes('No se completó el ingreso con Google'),
      'cancelling at Google reads as a cancelled sign-in',
    )
    const unknown = await get('/admin/signin?error=SomethingNobodyMapped')
    assert.ok(
      !unknown.body.includes('no está bien configurado'),
      'an unrecognised code does not send a person looking for the maintainer',
    )
    assert.ok(unknown.body.includes('No se pudo completar el ingreso'), 'it says what it knows')

    // --- 9. the same boundary, on a server action ---
    // T10's writes are server actions, which are POST endpoints with public URLs:
    // hiding the button that calls one hides nothing, so `requireAdmin()` has to
    // hold on the POST and not only on the page that drew the form.
    //
    // Every post here names a slug that **does not exist**, so the action can
    // never write, whatever the answer: if the gate ever regressed, this test
    // fails loudly instead of editing the archive it is running against.
    const [any] = await db.select({ slug: photo.slug }).from(photo).limit(1)
    if (!any) {
      console.log('  (no photographs in the database, skipping the server action case)')
    } else {
      const screen = await get(`/admin/photos/${any.slug}`, session)
      assert.equal(screen.status, 200, 'the photo screen is reachable with a session')
      const saveDetails = actionIdOn(screen.body, 'caption')

      // The control first: with a session the action really does run, so the
      // rejection below is a rejection and not the post bouncing off something else.
      const ran = await postAction(
        '/admin/photos/t10-no-existe',
        saveDetails,
        { slug: 't10-no-existe' },
        session,
      )
      assert.equal(ran.status, 303, 'an allowlisted post reaches the action')
      assert.equal(
        ran.location,
        '/admin/photos/t10-no-existe?error=no-existe',
        'and the action answers for itself: it looked the photograph up and did not find it',
      )

      await db.delete(appUser).where(eq(appUser.email, EMAIL))
      const refused = await postAction(
        '/admin/photos/t10-no-existe',
        saveDetails,
        { slug: 't10-no-existe' },
        session,
      )
      assert.equal(refused.status, 303, 'the same post with a revoked row is answered by the gate')
      assert.equal(
        refused.location,
        '/admin/signin',
        'the action never runs: authorization is checked inside it, not by the page that drew it',
      )

      const anonymous = await postAction('/admin/photos/t10-no-existe', saveDetails, {
        slug: 't10-no-existe',
      })
      assert.equal(anonymous.location, '/admin/signin', 'and a post with no session at all is too')
    }

    // --- 10. the Drive import screen, which is a route like any other ---
    // T12 added a page and an action, and the rule is per route and per action:
    // the layout above them is chrome and says so itself.
    await db.insert(appUser).values({ email: EMAIL, name: 'Auth Smoke' })

    /**
     * A sentence of the screen's own prose, and deliberately **not** its
     * heading. The heading text is also the page's `title`, and Next flushes the
     * document head -- and a copy of it in the flight payload, inside `<body>`
     * -- before `requireAdmin()`'s `redirect()` gets to fire. So a refused
     * request answers 307 with a body that carries "Importar desde Drive" twice
     * and nothing else of the screen: asserting on that string proves nothing
     * in either direction. This one is only ever rendered, and it sits above
     * every branch of the screen, so the positive case below holds whether or
     * not Drive is configured.
     */
    const SCREEN = 'Cada fotografía se importa de a una'

    const importAnonymous = await get('/admin/import')
    assert.equal(importAnonymous.status, 307, 'an anonymous GET /admin/import is redirected')
    assert.equal(importAnonymous.location, '/admin/signin')
    assert.ok(!importAnonymous.body.includes(SCREEN), 'and none of the screen is sent')

    const importAllowed = await get('/admin/import', session)
    assert.equal(importAllowed.status, 200, 'an allowlisted session reaches the import screen')
    assert.ok(
      importAllowed.body.includes(SCREEN),
      'and the screen renders whether or not Drive is configured yet',
    )

    /**
     * The action, which needs the screen to be showing its form: Drive
     * configured, a folder and a section chosen in the query string, and
     * something still pending in that folder. Skipped otherwise, so this file
     * still runs before the Google Cloud Console work is done.
     *
     * Scraped on `name="files"` and not on `name="folder"`: the folder picker is
     * a **GET** form carrying `<select name="folder">` and it comes first in the
     * markup, so looking for that field finds a form with no server action on it
     * at all. `files` is the checkbox on every pending row and exists nowhere
     * else -- and this branch already only runs when something is pending, which
     * is exactly when those boxes are on screen. **If it is ever renamed, rename
     * it here**: a miss does not fail, it takes the branch below that skips the
     * whole check.
     *
     * The folder id posted is deliberately not a Drive id, so the action refuses
     * it before it reaches Drive or the database: what is being tested is who
     * gets to run it, and a test of a gate must not be able to write.
     */
    const [section] = await db.select({ slug: category.slug }).from(category).limit(1)
    const screen = await get(
      `/admin/import?folder=${process.env.GOOGLE_DRIVE_MASTERS_FOLDER_ID ?? ''}&section=${section?.slug ?? ''}`,
      session,
    )
    const importNext = screen.body.includes('name="files"')
      ? actionIdOn(screen.body, 'files')
      : null
    if (!importNext) {
      console.log('  (the import form is not on screen -- Drive unconfigured or nothing pending)')
    } else {
      const posted = { folder: 'not-a-drive-id', section: 'campo' }
      const ran = await postAction('/admin/import', importNext, posted, session)
      assert.equal(ran.status, 303, 'an allowlisted post reaches the import action')
      /**
       * It comes back on the screen it was posted from, carrying the refusal.
       * `not-a-drive-id` passes `isFileId` -- that guard is about keeping a quote
       * out of Drive's `q` parameter, not about whether the folder exists -- so
       * the action got as far as `reachable()`, which is the check that refused
       * it. That is the point: the action ran and answered for itself.
       */
      assert.equal(
        ran.location,
        '/admin/import?folder=not-a-drive-id&section=campo&error=carpeta',
        'and the action answers for itself: it refused the folder, which is not the gate',
      )

      await db.delete(appUser).where(eq(appUser.email, EMAIL))
      const refused = await postAction('/admin/import', importNext, posted, session)
      assert.equal(
        refused.location,
        '/admin/signin',
        'the same post with a revoked row never reaches the action',
      )
      const anonymous = await postAction('/admin/import', importNext, posted)
      assert.equal(anonymous.location, '/admin/signin', 'and with no session at all it does not')
    }

    /**
     * --- 11. every action in the panel, statically ---
     *
     * The cases above prove the gate holds on the actions they post to. This is
     * the one that covers the action nobody wrote a case for: `requireAdmin()`
     * has to be the **first thing** an exported action does, and the only way to
     * check that for an action that does not exist yet is to check the shape.
     * Cheap, and it is the failure a runtime test cannot see.
     */
    const admin = join(process.cwd(), 'src/app/admin')
    const actionFiles = readdirSync(admin, { withFileTypes: true, recursive: true })
      .filter((entry) => entry.name === 'actions.ts')
      .map((entry) => join(entry.parentPath, entry.name))
    assert.ok(actionFiles.length >= 4, 'the panel has action files to check')
    let gated = 0
    let declared = 0
    for (const file of actionFiles) {
      const source = readFileSync(file, 'utf8')
      assert.ok(source.startsWith("'use server'"), `${file} is not a server action module`)

      /**
       * **Counted before it is parsed, and asserted equal afterwards.** The
       * pattern below cannot span a parameter list containing a closing paren --
       * a callback type, or a default like `= new Date()` -- and an action it
       * fails to match would simply not be checked. A gate check that skips in
       * silence is worse than none, because it reports success. So the number of
       * actions the file declares is the number the loop has to have inspected.
       */
      declared += source.match(/^export async function /gm)?.length ?? 0

      for (const [, name, body] of source.matchAll(
        /export async function (\w+)\([^)]*\)\s*\{\n((?:.*\n){0,6})/g,
      )) {
        // The **first statement**, not merely a line that mentions it: an early
        // version of this check passed with the call commented out, because a
        // comment contains the string it was looking for.
        const first = body
          .split('\n')
          .map((line) => line.trim())
          .find((line) => line && !line.startsWith('//') && !line.startsWith('*'))
        assert.equal(
          first,
          'await requireAdmin()',
          `${file}: ${name}() does not call requireAdmin() first -- it starts with ${first}`,
        )
        gated++
      }
    }
    assert.equal(
      gated,
      declared,
      `${declared} exported actions declared but only ${gated} could be parsed and checked: ` +
        'one of them has a signature the pattern above does not match, so it was skipped in silence',
    )
    assert.ok(gated >= 8, `only ${gated} actions found, which is fewer than the panel has`)
    console.log(`  (${gated} exported actions across ${actionFiles.length} files, all gated)`)

    console.log(
      'auth smoke ok: anonymous, allowlisted, revoked-with-live-cookie, forged, sign-in, ' +
        'outage, cancelled, unmapped, server action (allowed, revoked, anonymous), ' +
        'the import screen, and every action gated',
    )
  } finally {
    await db.delete(appUser).where(eq(appUser.email, EMAIL))
    await client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
