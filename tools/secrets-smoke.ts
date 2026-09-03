/**
 * Does any server-only secret reach the browser?
 *
 * _Security_ in ARCHITECTURE names this as a verification step in so many words:
 * "grep the generated client files for any key". This is that grep, made
 * repeatable, because it is the one check whose failure is unrecoverable -- the
 * repository is public, a bundle is served to everyone, and a leaked key is
 * leaked the moment it ships.
 *
 * It reads the **real values** out of `.env.local` and looks for them in the
 * build, which is the only version of this check worth running: reasoning about
 * which variables Next inlines is exactly the reasoning `NEXT_PUBLIC_` exists to
 * make unnecessary, and it is wrong the one time it matters.
 *
 * Three shapes of each secret are searched, because a bundler is free to write a
 * string in any of them: raw, JSON-escaped (`&` and friends), and
 * URI-encoded. The Drive service account is additionally **decoded** and its
 * fields searched, since it travels as base64 and a leak of the JSON would not
 * match the variable's own value.
 *
 * What counts as "the browser" is two things, not one:
 *
 * - `.next/static` -- the JavaScript and CSS every reader downloads.
 * - the prerendered `.html`, `.rsc` and `.body` under `.next/server/app` -- the
 *   responses themselves, which are served verbatim from the CDN.
 *
 * `.next/server`'s own chunks are **not** part of that: they are the server, and a
 * secret there is a secret doing its job. They are reported separately and never
 * fail the run, because a value appearing there is worth knowing about -- it means
 * the build inlined it rather than reading `process.env` at runtime -- without
 * being a leak.
 *
 * Nothing here ever prints a secret. A finding names the variable and the file.
 *
 *   npm run build && npm run secrets:smoke
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'

try {
  process.loadEnvFile('.env.local')
} catch {
  // Fine: the variables may come from the environment instead.
}

const BUILD = '.next'

/** Served to a browser. A secret in any of these is the failure this exists for. */
const CLIENT = [join(BUILD, 'static')]

/** Prerendered responses live beside the server code, so they are picked by extension. */
const RESPONSES = join(BUILD, 'server', 'app')
const RESPONSE_EXT = new Set(['.html', '.rsc', '.body', '.json'])

/** The server's own code. Reported, never failed on. */
const SERVER = join(BUILD, 'server')

function walk(dir: string, keep: (path: string) => boolean): string[] {
  let found: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return found
  }
  for (const entry of entries) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) found = found.concat(walk(path, keep))
    else if (keep(path)) found.push(path)
  }
  return found
}

/**
 * Every way a build might have written this string. Short values are dropped: a
 * two-character secret would match everything and prove nothing, and anything
 * that short is not a secret worth having.
 */
function shapes(value: string): string[] {
  const all = new Set([value, JSON.stringify(value).slice(1, -1), encodeURIComponent(value)])
  return [...all].filter((shape) => shape.length >= 8)
}

/** What to look for: every variable that is not `NEXT_PUBLIC_`, plus the decoded key. */
function secrets(): { name: string; needles: string[] }[] {
  const found = Object.entries(process.env)
    .filter(([name, value]) => SERVER_ONLY.has(name) && value)
    .map(([name, value]) => ({ name, needles: shapes(value as string) }))

  const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64
  if (encoded) {
    try {
      const key = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as Record<
        string,
        unknown
      >
      // The private key first: it is the one that grants anything. The client
      // email and the key id are here because they identify the account, which
      // is what an attacker needs before the key is useful to them.
      for (const field of ['private_key', 'private_key_id', 'client_email'] as const) {
        const value = key[field]
        if (typeof value === 'string') {
          found.push({ name: `service account ${field}`, needles: shapes(value) })
        }
      }
    } catch {
      console.warn('! GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 is not base64 of JSON, so only the')
      console.warn('  variable itself is searched. Check the value before deploying.')
    }
  }
  return found
}

/**
 * The names from `.env.example` that are not public, written out rather than
 * derived from "does not start with NEXT_PUBLIC_": the environment a build runs in
 * holds hundreds of variables, and `PATH` matching a chunk proves nothing.
 */
const SERVER_ONLY = new Set([
  'DATABASE_URL',
  'AUTH_SECRET',
  'AUTH_GOOGLE_ID',
  'AUTH_GOOGLE_SECRET',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'GOOGLE_SERVICE_ACCOUNT_JSON_BASE64',
  'GOOGLE_DRIVE_MASTERS_FOLDER_ID',
])

function scan(files: string[], looking: ReturnType<typeof secrets>) {
  const hits: { name: string; file: string }[] = []
  for (const file of files) {
    const text = readFileSync(file, 'latin1')
    for (const { name, needles } of looking) {
      if (needles.some((needle) => text.includes(needle))) hits.push({ name, file })
    }
  }
  return hits
}

const looking = secrets()
assert.ok(
  looking.length > 0,
  'no server-only variables are set, so this check would pass vacuously',
)

const clientFiles = [
  ...CLIENT.flatMap((dir) => walk(dir, () => true)),
  ...walk(RESPONSES, (path) => RESPONSE_EXT.has(extname(path))),
]
assert.ok(
  clientFiles.length > 100,
  `only ${clientFiles.length} client files found -- run the build`,
)

console.log(`Searching ${clientFiles.length} client files for ${looking.length} secrets.`)

const leaked = scan(clientFiles, looking)
for (const { name, file } of leaked) console.error(`LEAK  ${name} appears in ${file}`)

// The server's own chunks, minus the prerendered responses already counted above.
const serverOnly = walk(SERVER, (path) => !RESPONSE_EXT.has(extname(path)))
const inlined = scan(serverOnly, looking)
const inlinedNames = [...new Set(inlined.map((h) => h.name))]
if (inlinedNames.length > 0) {
  console.log(`\nInlined into server code (not a leak): ${inlinedNames.join(', ')}`)
}

assert.equal(leaked.length, 0, `${leaked.length} secret(s) reached the client bundle`)

// Both public variables are meant to be in there; if they are not, the build was
// made without them and the scan above was searching a bundle that is not the one
// production will serve.
for (const name of ['NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_IMAGE_BASE_URL'] as const) {
  const value = process.env[name]
  assert.ok(value, `${name} is not set, so this build is not the one production serves`)
  assert.ok(
    scan(clientFiles, [{ name, needles: shapes(value) }]).length > 0,
    `${name} is set but reached no client file -- the build did not pick it up`,
  )
}

console.log('\nNo server secret reached the client bundle, and both public values did.')
