import { handlers } from '@/lib/auth'

/**
 * Auth.js's own endpoints: the Google redirect, the callback, the session and
 * the CSRF token. Nothing of the panel is reachable through here -- this route
 * only mints and clears the cookie. The allowlist is enforced in the `signIn`
 * callback and again, per request, in `requireAdmin`.
 */
export const { GET, POST } = handlers
