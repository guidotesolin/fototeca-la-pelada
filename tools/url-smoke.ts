/**
 * Smoke test for the URL guards in `src/lib/url.ts`. They stand between
 * `site_text` -- which the panel will make editable in T11 -- and an `href` or an
 * `<iframe src>`, so the cases that matter are the ones that fool a naive check:
 * a hostname that merely ends with the right string, userinfo before the real
 * host, and a scheme that executes.
 *
 * No network and no database: the guards are pure.
 *
 *   npm run url:smoke
 */
import assert from 'node:assert/strict'
import { externalUrl, mapEmbedUrl } from '../src/lib/url'

const MAP: [string | undefined, boolean][] = [
  ['https://maps-api-ssl.google.com/maps?hl=es&ll=-30.867456,-60.968192&output=embed&z=15', true],
  ['https://maps.google.com/maps?output=embed', true],
  ['https://www.google.com/maps/embed?pb=x', true],
  // http would be blocked as mixed content anyway, and is how a downgrade sneaks in.
  ['http://maps.google.com/maps?output=embed', false],
  // Ends with the allowed host and is a different site: why this is not `endsWith`.
  ['https://maps.google.com.evil.com/maps', false],
  ['https://evil.com/?next=maps.google.com', false],
  // Userinfo: the host here is evil.com, whatever it reads like left to right.
  ['https://www.google.com@evil.com/', false],
  ['javascript:alert(1)', false],
  ['data:text/html,<script>alert(1)</script>', false],
  ['//maps.google.com/maps', false],
  ['not a url at all', false],
  ['', false],
  [undefined, false],
]

const EXTERNAL: [string | undefined, boolean][] = [
  ['https://www.instagram.com/fototeca.lp', true],
  ['https://www.youtube.com/channel/UCUJO9JPbwXfiP-GoSOwySjQ', true],
  // The host is deliberately open here: a fourth network must not need a deploy.
  ['https://mastodon.social/@fototeca', true],
  ['http://www.instagram.com/fototeca.lp', false],
  ['javascript:alert(document.cookie)', false],
  ['data:text/html,x', false],
  ['mailto:fototecalp@gmail.com', false],
  ['', false],
  [undefined, false],
]

let checks = 0

function run(name: string, guard: (v: string | undefined) => string | null, cases: typeof MAP) {
  for (const [input, allowed] of cases) {
    const got = guard(input)
    assert.equal(
      got !== null,
      allowed,
      `${name}: expected ${allowed ? 'to allow' : 'to reject'} ${JSON.stringify(input)}, got ${JSON.stringify(got)}`,
    )
    checks++
  }
  console.log(`${name}: ${cases.length} cases pass`)
}

run('mapEmbedUrl', mapEmbedUrl, MAP)
run('externalUrl', externalUrl, EXTERNAL)

// A guard that quietly rewrote its input would be worse than one that rejected it.
assert.equal(
  externalUrl('https://www.instagram.com/fototeca.lp'),
  'https://www.instagram.com/fototeca.lp',
)
checks++

console.log(`\n${checks} checks pass`)
