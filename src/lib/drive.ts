import { createSign } from 'node:crypto'
import { MAX_BYTES } from './images'

/**
 * Google Drive, read-only, through a service account. Drive is the preservation
 * vault and nothing else: it holds the masters at full resolution and never
 * serves a byte to a reader, which is R2's job. The split is not a preference --
 * 600 high-resolution scans do not fit in R2's 10 GB free tier, and Drive's own
 * terms forbid using it as a CDN.
 *
 * **A service account rather than the brothers' OAuth token.** It does not
 * expire, it is read-only, and it sees exactly the one folder that was shared
 * with its address. The key travels as base64 in an environment variable and is
 * decoded in memory here: the JSON file never enters the repository and never
 * touches the disk.
 *
 * **No `googleapis` dependency.** What an import needs is two REST endpoints and
 * an RS256 signature, and Node signs RS256 in the standard library. The package
 * is tens of megabytes of generated clients for the two calls below.
 *
 * Credentials are read on first use, the way `lib/r2.ts` does it, so the pure
 * helpers stay importable without them.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const API = 'https://www.googleapis.com/drive/v3'
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly'

/**
 * Drive's own id shape. Checked because a folder id arrives from a form and ends
 * up inside the `q` parameter of a list call, where a quote would close the
 * string and start something else.
 */
const FILE_ID = /^[A-Za-z0-9_-]{8,256}$/

export type DriveFile = {
  id: string
  name: string
  mimeType: string
  /** What Drive says it weighs. A pre-filter, never the ceiling: see `download`. */
  size: number | null
}

export function isFileId(value: unknown): value is string {
  return typeof value === 'string' && FILE_ID.test(value)
}

/** The folder the masters live under, and the only root the panel offers. */
export function mastersFolderId(): string {
  const id = process.env.GOOGLE_DRIVE_MASTERS_FOLDER_ID
  if (!isFileId(id)) {
    throw new Error(
      'GOOGLE_DRIVE_MASTERS_FOLDER_ID is not set, or is not a Drive id: see .env.example',
    )
  }
  return id
}

type ServiceAccount = { client_email: string; private_key: string }

/**
 * The key, decoded in memory. Base64 because a PEM private key carries newlines
 * that no environment-variable dialect agrees on, and because a single opaque
 * blob is one thing to paste into Vercel rather than two that must match.
 */
function serviceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64
  if (!raw) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 is not set: see .env.example')
  }
  const json = Buffer.from(raw, 'base64').toString('utf8')
  let key: Partial<ServiceAccount>
  try {
    key = JSON.parse(json)
  } catch {
    /**
     * Told apart, because the failure this actually gets is neither of the two
     * things "not base64" sends somebody to check. A 3 KB base64 line copied out
     * of a terminal comes back **cut short**: it still decodes, into a JSON
     * object missing its tail, and the first version of this message sent the
     * maintainer to look at the encoding of a value that was encoded correctly
     * and merely incomplete.
     */
    const looksCut = json.trimStart().startsWith('{')
    throw new Error(
      looksCut
        ? `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 decodes to ${json.length} bytes of JSON that stop ` +
            'in the middle: the value is incomplete, most likely truncated when it was pasted. ' +
            'Re-run the base64 command and write it straight to .env.local rather than through the clipboard.'
        : 'GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 is not base64 of a JSON key',
    )
  }
  if (!key.client_email || !key.private_key) {
    throw new Error('the service account key has no client_email or private_key')
  }
  return key as ServiceAccount
}

const b64 = (value: object | string) =>
  Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url')

/** Reused until a minute before it expires: an import is many calls in a row. */
let cached: { token: string; expiresAt: number } | undefined

async function accessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cached && cached.expiresAt > now + 60) return cached.token

  const { client_email, private_key } = serviceAccount()
  const claim = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  })}`
  const signature = createSign('RSA-SHA256').update(claim).sign(private_key).toString('base64url')

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${claim}.${signature}`,
    }),
  })
  if (!response.ok) {
    throw new Error(
      `Drive refused the service account: ${response.status} ${await response.text()}`,
    )
  }
  const body = (await response.json()) as { access_token?: string; expires_in?: number }
  if (!body.access_token) throw new Error('Drive returned no access token')

  cached = { token: body.access_token, expiresAt: now + (body.expires_in ?? 3600) }
  return cached.token
}

/**
 * One authenticated GET, with **one retry on a 401 and only on a 401**.
 *
 * The token is cached in this process for nearly an hour, and the cache is
 * keyed on our own clock: `expiresAt` is `now + expires_in` read from a machine
 * whose time may be behind Google's. A clock a few minutes slow makes us go on
 * presenting a token Google has already expired, and without this every Drive
 * call -- the screen's listing and every import -- would fail for those minutes
 * with no way back but restarting the process. Dropping the token and minting a
 * fresh one turns that into one wasted round trip.
 *
 * The retry is deliberately not general: a 403, a 404 or a 429 mean what they
 * say, and asking again immediately would only spend quota.
 */
/**
 * What Drive said no with, kept on the error because the difference matters to a
 * caller: "this file is not there" is an answer, and "Drive is rate-limiting" is
 * a failure, and reporting the second as the first tells an administrator to go
 * fix a folder that is perfectly fine.
 */
class DriveError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function call(path: string): Promise<Response> {
  let response = await fetch(`${API}/${path}`, {
    headers: { authorization: `Bearer ${await accessToken()}` },
  })
  if (response.status === 401) {
    cached = undefined
    response = await fetch(`${API}/${path}`, {
      headers: { authorization: `Bearer ${await accessToken()}` },
    })
  }
  if (!response.ok) {
    throw new DriveError(
      response.status,
      `Drive answered ${response.status} for ${path}: ${await response.text()}`,
    )
  }
  return response
}

/**
 * One `files.list` query, every page of it. `supportsAllDrives` costs two
 * parameters and covers the case where the folder was shared from a shared
 * drive, which otherwise lists empty with no error at all.
 */
async function list<T>(query: string, fields: string): Promise<T[]> {
  const found: T[] = []
  let token: string | undefined
  do {
    const params = new URLSearchParams({
      q: query,
      fields: `nextPageToken, files(${fields})`,
      pageSize: '1000',
      orderBy: 'name_natural',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    })
    if (token) params.set('pageToken', token)
    const page = (await (await call(`files?${params}`)).json()) as {
      files?: T[]
      nextPageToken?: string
    }
    found.push(...(page.files ?? []))
    token = page.nextPageToken
  } while (token)
  return found
}

/**
 * Whether one folder sits directly inside another, which is how the import
 * authorises the folder a form named. It reads that one file's `parents` and
 * nothing else: the obvious alternative is to list the parent's folders and look
 * for it, and that is a `files.list` of up to a thousand rows charged **once per
 * imported photograph** -- 560 identical listings over the vault, against the
 * same rate limit the screen's own listing competes for.
 */
export async function isInsideFolder(fileId: string, parentId: string): Promise<boolean> {
  if (!isFileId(fileId) || !isFileId(parentId)) return false
  let file: { parents?: string[] }
  try {
    file = (await (await call(`files/${fileId}?fields=parents&supportsAllDrives=true`)).json()) as {
      parents?: string[]
    }
  } catch (error) {
    /**
     * **A "no such file" is an answer here, not a failure.** An id that names
     * nothing, or something the service account cannot see, is exactly the case
     * this function exists to refuse -- and the caller turns a `false` into "esa
     * carpeta no es la de originales", which is the true and useful sentence.
     * Everything else -- a 429, a 500, the network -- is rethrown, because
     * telling somebody their folder is wrong when Drive is merely busy sends
     * them to fix something that is not broken.
     */
    if (error instanceof DriveError && (error.status === 404 || error.status === 403)) return false
    throw error
  }
  return (file.parents ?? []).includes(parentId)
}

/** The folders directly under one folder, so the panel can offer a choice. */
export async function listFolders(folderId: string): Promise<{ id: string; name: string }[]> {
  if (!isFileId(folderId)) throw new Error(`not a Drive folder id: ${folderId}`)
  return list(
    `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    'id, name',
  )
}

/**
 * The images in one folder. Narrowed by the mimeType Drive itself worked out,
 * which is a **convenience and not a check**: it keeps the brothers' `.txt`
 * notes out of the count. What the bytes actually are is decided by sharp, in
 * `lib/images.ts`, after they are downloaded.
 */
export async function listImages(folderId: string): Promise<DriveFile[]> {
  if (!isFileId(folderId)) throw new Error(`not a Drive folder id: ${folderId}`)
  const files = await list<{ id: string; name: string; mimeType: string; size?: string }>(
    `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
    'id, name, mimeType, size',
  )
  return files.map((f) => ({ ...f, size: f.size ? Number(f.size) : null }))
}

/**
 * A master's bytes. The ceiling is enforced **as the body arrives** rather than
 * after it: a folder is somebody else's directory, and `arrayBuffer()` on a file
 * dropped there by mistake would hold all of it in memory before anything got to
 * object.
 */
export async function download(fileId: string): Promise<Buffer> {
  if (!isFileId(fileId)) throw new Error(`not a Drive file id: ${fileId}`)
  const response = await call(`files/${fileId}?alt=media&supportsAllDrives=true`)
  if (!response.body) throw new Error(`Drive returned no body for ${fileId}`)

  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength
    if (total > MAX_BYTES) {
      const mb = (n: number) => Math.round(n / 1024 / 1024)
      throw new Error(`the file is over the ${mb(MAX_BYTES)} MB limit`)
    }
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}
