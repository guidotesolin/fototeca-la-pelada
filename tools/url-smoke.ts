/**
 * Smoke test for the URL guards in `src/lib/url.ts`. They stand between
 * `site_text` -- which the panel edits, and validates through these same two
 * functions before storing -- and an `href` or an `<iframe src>`, so the cases
 * that matter are the ones that fool a naive check:
 * a hostname that merely ends with the right string, userinfo before the real
 * host, and a scheme that executes.
 *
 * No network and no database: the guards are pure.
 *
 *   npm run url:smoke
 */
import assert from 'node:assert/strict'
import {
  VIDEO_HOSTS,
  externalUrl,
  isYoutubeId,
  mapEmbedUrl,
  videoEmbedUrl,
  videoWatchUrl,
} from '../src/lib/url'

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

/**
 * The YouTube id, which is the Videoteca's answer to the same problem: the panel
 * types it, and it lands inside an `<iframe src>`. Eleven characters exactly,
 * because that is what YouTube mints -- ten or twelve is somebody pasting
 * something else.
 */
const YOUTUBE: [unknown, boolean][] = [
  // The archive's own three.
  ['yJ4sZrsuzyw', true],
  ['zHVmnXb71RU', true],
  ['OPhClHrevOk', true],
  ['-_aB9zZ01x-', true],
  ['yJ4sZrsuzw', false], // ten
  ['yJ4sZrsuzwwx', false], // twelve
  // A whole address is the mistake this exists to catch: it is the thing an
  // administrator has in the clipboard.
  ['https://www.youtube.com/watch?v=yJ4sZrsuzyw', false],
  ['https://youtu.be/yJ4sZrsuzyw', false],
  ['yJ4sZrsuzyw?rel=0', false],
  ['yJ4sZrsuz/w', false],
  ['../../etc/pas', false],
  ['<script>ale', false],
  ['javascript:a', false],
  ['yJ4sZrsuzy ', false],
  ['', false],
  [undefined, false],
  [null, false],
  [11, false],
]

for (const [input, allowed] of YOUTUBE) {
  assert.equal(
    isYoutubeId(input),
    allowed,
    `isYoutubeId: expected ${allowed ? 'to allow' : 'to reject'} ${JSON.stringify(input)}`,
  )
  checks++
}
console.log(`isYoutubeId: ${YOUTUBE.length} cases pass`)

/**
 * The embed never leaves the allowlist the CSP is built from. If these two ever
 * disagree the frame renders empty and nothing reports it, which is precisely the
 * failure `VIDEO_HOSTS` is exported to prevent.
 */
assert.equal(new URL(videoEmbedUrl('yJ4sZrsuzyw')).hostname, VIDEO_HOSTS[0])
assert.equal(new URL(videoEmbedUrl('yJ4sZrsuzyw')).protocol, 'https:')
assert.equal(
  videoEmbedUrl('yJ4sZrsuzyw'),
  'https://www.youtube-nocookie.com/embed/yJ4sZrsuzyw?rel=0',
)
// The no-JavaScript link is the one address that is deliberately not nocookie:
// it is a navigation the reader asked for.
assert.equal(videoWatchUrl('yJ4sZrsuzyw'), 'https://www.youtube.com/watch?v=yJ4sZrsuzyw')
checks += 4

// A guard that quietly rewrote its input would be worse than one that rejected it.
assert.equal(
  externalUrl('https://www.instagram.com/fototeca.lp'),
  'https://www.instagram.com/fototeca.lp',
)
checks++

console.log(`\n${checks} checks pass`)
