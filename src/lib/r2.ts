import { randomBytes } from 'node:crypto'
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'

/**
 * Cloudflare R2: the derivatives the public site consumes, plus the rescued
 * masters until real scans replace them. Free egress is the whole reason — a
 * gallery is nothing but egress.
 *
 * Keys carry a random component per photo. Without it, `photos/campo-078/web.avif`
 * would let anyone walk the entire archive from a single URL, and unpublishing a
 * photo would be a lie: the file would still answer at a guessable address.
 *
 * The naming convention lives in `lib/photo.ts`, which the public site imports
 * without dragging this file -- and the AWS SDK -- into its bundle.
 */

const MIME: Record<string, string> = {
  avif: 'image/avif',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

/** A year in the cache: the key changes whenever the bytes do. */
const CACHE_CONTROL = 'public, max-age=31536000, immutable'

let client: S3Client | undefined

/** Built on first use, so the pure helpers above stay importable without credentials. */
function s3(): S3Client {
  if (client) return client
  const account = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!account || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 credentials are not set: see .env.example')
  }
  client = new S3Client({
    region: 'auto',
    endpoint: `https://${account}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
  return client
}

function bucket(): string {
  const name = process.env.R2_BUCKET
  if (!name) throw new Error('R2_BUCKET is not set')
  return name
}

function contentTypeFor(ext: string): string {
  return MIME[ext] ?? 'application/octet-stream'
}

/** A prefix nobody can derive from another photo's, or from the slug alone. */
export function newPrefix(kind: 'photos' | 'masters', slug: string): string {
  return `${kind}/${slug}-${randomBytes(9).toString('base64url')}`
}

export async function put(key: string, data: Buffer, ext: string): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: data,
      ContentType: contentTypeFor(ext),
      CacheControl: CACHE_CONTROL,
    }),
  )
}

/** Reads an object back, which is how a stored hash gets checked against the bytes. */
export async function getBytes(key: string): Promise<Buffer> {
  const out = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }))
  if (!out.Body) throw new Error(`${key} came back empty`)
  return Buffer.from(await out.Body.transformToByteArray())
}

export async function exists(key: string): Promise<boolean> {
  try {
    await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }))
    return true
  } catch (error) {
    if (isNotFound(error)) return false
    throw error
  }
}

/** Every key under a prefix, or the whole bucket when there is none. */
export async function listKeys(prefix = ''): Promise<string[]> {
  const keys: string[] = []
  let token: string | undefined
  do {
    const page = await s3().send(
      new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, ContinuationToken: token }),
    )
    for (const object of page.Contents ?? []) if (object.Key) keys.push(object.Key)
    token = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (token)
  return keys
}

/**
 * Everything under a prefix, listed and then deleted. A takedown cannot build the
 * key list from the width table: a narrow master produces a rendition at its own
 * width, so guessing would leave a file behind and the takedown would not be true.
 * Returns how many objects were removed.
 */
export async function removePrefix(prefix: string): Promise<number> {
  const keys = await listKeys(prefix)
  for (let i = 0; i < keys.length; i += 1000) {
    // DeleteObjects takes a thousand at a time.
    await s3().send(
      new DeleteObjectsCommand({
        Bucket: bucket(),
        Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })) },
      }),
    )
  }
  return keys.length
}

function isNotFound(error: unknown): boolean {
  const name = (error as { name?: string })?.name
  const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode
  return name === 'NotFound' || name === 'NoSuchKey' || status === 404
}
