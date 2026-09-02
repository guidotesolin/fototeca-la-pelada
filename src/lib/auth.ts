import { cache } from 'react'
import { eq } from 'drizzle-orm'
import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { appUser } from '@/db/schema'

/**
 * Authentication and authorization for the panel. Two separate things, and the
 * distinction is the whole design:
 *
 * - **Authentication** is Google's: the session cookie is a signed JWT, no
 *   adapter and no session table. The schema has none of Auth.js's four tables
 *   and does not need them -- nothing about a session is worth persisting when
 *   the allowlist is the real gate.
 * - **Authorization** is a row in `app_user`, checked against the database on
 *   every request. Not once at sign-in: a JWT lives 30 days, so a check made
 *   only when it was minted would leave a removed administrator with a working
 *   session for a month. `revoke` in `tools/admin.ts` has to take effect on the
 *   next request, which means the lookup happens on the next request.
 *
 * There is no role column: everyone in `app_user` is an administrator, which is
 * the decision recorded in ARCHITECTURE's ponytail pass.
 */

/** The allowlist. One indexed lookup on a unique column; null means not an admin. */
async function lookup(email: string | null | undefined) {
  if (!email) return null
  const [row] = await db
    .select({ id: appUser.id, email: appUser.email, name: appUser.name })
    .from(appUser)
    .where(eq(appUser.email, email.toLowerCase()))
    .limit(1)
  return row ?? null
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Google],
  // No adapter, so this is already the default. Written out because it is a
  // decision, and because a future adapter would silently flip it to 'database'.
  session: { strategy: 'jwt' },
  // Auth.js's own screens are in English and the panel is not. `error` points at
  // the same page so a rejected account lands somewhere that explains itself.
  pages: { signIn: '/admin/signin', error: '/admin/signin' },
  callbacks: {
    /**
     * The gate at sign-in. Returning false stops the flow and sends the browser
     * to the error page with `?error=AccessDenied`; returning a string redirects
     * there instead, without signing anybody in.
     *
     * `email_verified` matters: the allowlist is keyed by address, so an
     * unverified claim to one would be enough to walk in. Google sets it false
     * for some Workspace accounts, which is exactly the case to refuse.
     *
     * The `catch` is not defensive decoration. Auth.js turns **anything thrown
     * in this callback** into `AccessDenied`, so a database that fails to answer
     * would tell a real administrator, in so many words, that they are not one.
     * Both paths refuse the sign-in; they must not give the same reason.
     */
    signIn: async ({ profile }) => {
      if (profile?.email_verified !== true) return false
      try {
        return Boolean(await lookup(profile.email))
      } catch (error) {
        console.error('[auth] the allowlist lookup failed, so nobody is signed in:', error)
        return '/admin/signin?error=Unavailable'
      }
    },
  },
})

/** The signed-in administrator, or null. Memoized: one lookup per request, not per component. */
export const currentAdmin = cache(async () => {
  const session = await auth()
  return lookup(session?.user?.email)
})

/**
 * The panel's authorization boundary. Every page, route handler and server
 * action under `/admin` calls this first -- not the layout, which Next's own
 * authentication guide warns is not a boundary: a layout does not re-render on
 * client-side navigation and does not control whether a nested segment renders.
 */
export async function requireAdmin() {
  const admin = await currentAdmin()
  if (!admin) redirect('/admin/signin')
  return admin
}
