/**
 * A message code from `./ui`, thrown where the mistake is found and turned into
 * `?error=<code>` by `outcome()`.
 *
 * **In a file of its own, and the reason is that `./write` imports `next/cache`.**
 * Anything that throws one of these would otherwise drag Next's runtime along
 * with it, which costs nothing inside the app and everything outside it: the
 * translation write path is the riskiest thing the panel does with a form, and
 * `npm run db:smoke` asserts it against a real database from a plain Node
 * process. An error class has no business needing a framework.
 */
export class Invalid extends Error {}
