/**
 * Smoke test for the counter in `src/lib/rate-limit.ts`, which is what F31 asks
 * for on `/buscar` and on the panel's writes.
 *
 * Three things it has to get right, and each one is a way a rate limiter fails
 * silently rather than loudly: it must let the Nth request through and stop the
 * N+1th, it must not leak one client's count into another's, and it must forget a
 * window once it has passed -- a limiter that never resets locks a reader out for
 * good, which is worse than not having one.
 *
 * The fourth is the `MAX_KEYS` cap. It is the reason this file exists at all: a
 * limiter that grows a `Map` without bound is a better denial of service than the
 * one it prevents, so the check is that ten thousand distinct clients do not put
 * the instance somewhere it cannot come back from.
 *
 * No network, no database, no clock faking -- the windows here are milliseconds.
 *
 *   npm run ratelimit:smoke
 */
import assert from 'node:assert/strict'
import { clientKey, overLimit } from '../src/lib/rate-limit'

let checks = 0
function check(what: string, got: unknown, want: unknown) {
  assert.deepEqual(
    got,
    want,
    `${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`,
  )
  checks++
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const headers = (init: Record<string, string>) => new Headers(init)

async function main() {
  // --- the allowance is spent, not exceeded, at exactly the limit ---
  const a = `a:${Math.random()}`
  for (let i = 1; i <= 3; i++) check(`request ${i} of 3 passes`, overLimit(a, 3, 60_000), false)
  check('the fourth is refused', overLimit(a, 3, 60_000), true)
  check('and so is the fifth', overLimit(a, 3, 60_000), true)

  // --- one client's flood is not charged to another ---
  const b = `b:${Math.random()}`
  check('a different key starts clean', overLimit(b, 3, 60_000), false)
  check('the first key is still refused', overLimit(a, 3, 60_000), true)

  // --- the window reopens ---
  const c = `c:${Math.random()}`
  check('spends its one request', overLimit(c, 1, 30), false)
  check('refused inside the window', overLimit(c, 1, 30), true)
  await sleep(60)
  check('let back in once the window passed', overLimit(c, 1, 30), false)

  // --- the cap holds, and the limiter still works on the other side of it ---
  // Twelve thousand against a MAX_KEYS of ten, so this walks the map straight
  // through the sweep and the clear. What matters is that it survives both and
  // still counts afterwards.
  for (let i = 0; i < 12_000; i++) overLimit(`flood:${i}`, 5, 60_000)
  const d = `d:${Math.random()}`
  check('still counts after the cap was hit', overLimit(d, 1, 60_000), false)
  check('and still refuses after the cap was hit', overLimit(d, 1, 60_000), true)

  // --- who a request is from ---
  check(
    'the client is the leftmost x-forwarded-for entry',
    clientKey(headers({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.178' })),
    '203.0.113.7',
  )
  check(
    'whitespace around it is not part of the key',
    clientKey(headers({ 'x-forwarded-for': '  203.0.113.7 ,10.0.0.1' })),
    '203.0.113.7',
  )
  check(
    'x-real-ip is the fallback',
    clientKey(headers({ 'x-real-ip': '198.51.100.4' })),
    '198.51.100.4',
  )
  // An empty header must not become an empty key that every unidentified client
  // then shares by accident -- they share one on purpose instead, and it is named.
  check('an empty header falls through', clientKey(headers({ 'x-forwarded-for': '' })), 'unknown')
  check('no header at all', clientKey(headers({})), 'unknown')

  console.log(`\n${checks} checks pass`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
