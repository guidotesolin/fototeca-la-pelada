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
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { encode } from 'next-auth/jwt'
import postgres from 'postgres'
import { POSTGRES_OPTIONS } from '../src/db/connect'
import { appUser } from '../src/db/schema'

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

    console.log(
      'auth smoke ok: anonymous, allowlisted, revoked-with-live-cookie, forged, sign-in, ' +
        'outage, cancelled, unmapped',
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
