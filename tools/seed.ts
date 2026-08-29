/**
 * Seeds the database and R2 from the rescued archive.
 *
 *   npm run db:seed            all of it
 *   npm run db:seed -- --limit 5
 *
 * Resumable: a photo's row is written only after every one of its files is in R2,
 * so a row that exists means that photo is complete and the next run skips it.
 * The rescued copies go in as `master_source = 'sites'`; when a real scan arrives
 * it replaces the master without touching one field of metadata.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { eq, isNull, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import {
  category,
  categoryTranslation,
  photo,
  photoCategory,
  photoTranslation,
} from '../src/db/schema'
import { derive } from '../src/lib/images'
import { exists, getBytes, keyFor, masterKeyFor, newPrefix, put } from '../src/lib/r2'

try {
  process.loadEnvFile('.env.local')
} catch {
  // Fine: the variables may come from the environment.
}

type Photo = {
  slug: string
  position: number
  caption: string
  credit: string
  notes: string[]
  year_from: number | null
  year_to: number | null
  file: string
  width: number
  height: number
  bytes: number
  sha256: string
}
type Section = {
  slug: string
  title: string
  position: number
  intro: string
  photos: Photo[]
}

const ARCHIVE = join(__dirname, '..', 'archive')
const SOURCE_LOCALE = 'es' as const

/**
 * The authors wrote the warning into the caption of the photo it starts at:
 * "A CONTINUACIÓN, FOTOGRAFÍAS DE 'CARNEADAS'". On the old site that worked
 * because position was all there was. Here it becomes `photo.sensitive`, which
 * survives search, filters and a direct link — the whole point of the move.
 * The caption itself is left alone: trimming an author's sentence is the panel's
 * call, not a script's.
 */
const WARNING_STARTS_HERE = /A CONTINUACIÓN,? FOTOGRAF[IÍ]AS DE "?CARNEADAS/i

/** Photos at a time. The wall clock is R2 round trips, not sharp. */
const CONCURRENCY = 5

const VERIFY = process.argv.includes('--verify')
const limitArg = process.argv.indexOf('--limit')
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set: copy .env.example to .env.local and fill it in.')
  process.exit(1)
}
const client = postgres(url, { max: CONCURRENCY, prepare: false })
const db = drizzle(client)

const empty = (s: string) => (s.trim() ? s.trim() : null)

/** Runs `work` over `items` a few at a time: 592 round trips are slow one by one. */
async function inBatches<T, R>(items: T[], size: number, work: (item: T) => Promise<R>) {
  const out: R[] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(work))))
  }
  return out
}

/**
 * What the task card asks for: counts per category against T1, a sample of hashes
 * read back out of R2, and a thumbnail on every photo. Re-runnable, reads only.
 */
async function verify(sections: Section[]) {
  let bad = 0
  for (const section of sections) {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(photoCategory)
      .innerJoin(category, eq(category.id, photoCategory.categoryId))
      .where(eq(category.slug, section.slug))
    const ok = row.n === section.photos.length
    if (!ok) bad++
    console.log(
      `  ${ok ? 'ok  ' : 'MAL '} ${section.slug.padEnd(16)} ${row.n} / ${section.photos.length}`,
    )
  }

  const rows = await db
    .select({ slug: photo.slug, mk: photo.masterKey, tk: photo.thumbKey, sha: photo.masterSha256 })
    .from(photo)
  console.log(`\n  ${rows.length} photos in the database`)

  const missingThumb = rows.filter((r) => !r.tk).map((r) => r.slug)
  const absent = (
    await inBatches(
      rows.filter((r) => r.tk),
      16,
      async (r) => ((await exists(r.tk!)) ? null : r.slug),
    )
  ).filter(Boolean)
  console.log(
    `  thumbnails: ${missingThumb.length} without a key, ${absent.length} missing from R2`,
  )

  const sample = rows.filter((_, i) => i % Math.ceil(rows.length / 10) === 0)
  let mismatched = 0
  for (const r of sample) {
    const hash = createHash('sha256')
      .update(await getBytes(r.mk!))
      .digest('hex')
    if (hash !== r.sha) {
      mismatched++
      console.log(`  MAL ${r.slug}: R2 does not match the stored hash`)
    }
  }
  console.log(`  sha256: ${sample.length} masters read back from R2, ${mismatched} mismatched`)

  const total = sections.reduce((n, s) => n + s.photos.length, 0)
  assert.equal(rows.length, total, 'every photo in archive.json is in the database')
  assert.equal(bad, 0, 'every category count matches')
  assert.equal(missingThumb.length + absent.length, 0, 'every photo has a thumbnail in R2')
  assert.equal(mismatched, 0, 'every sampled master matches its hash')
  console.log('\nverify ok')
}

async function main() {
  const archive = JSON.parse(readFileSync(join(ARCHIVE, 'archive.json'), 'utf8'))
  // The home page carries text but no photographs, so it is not a category.
  const sections: Section[] = archive.sections.filter((s: Section) => s.photos.length > 0)

  if (VERIFY) return verify(sections)

  const known = new Set((await db.select({ slug: photo.slug }).from(photo)).map((r) => r.slug))
  if (known.size) console.log(`resuming: ${known.size} photos already seeded`)

  const categories = new Map<string, number>()
  for (const [index, section] of sections.entries()) {
    const existing = await db
      .select({ id: category.id })
      .from(category)
      .where(eq(category.slug, section.slug))
    if (existing.length) {
      categories.set(section.slug, existing[0].id)
      continue
    }
    const [row] = await db
      .insert(category)
      .values({ slug: section.slug, position: index + 1, visible: true })
      .returning({ id: category.id })
    await db.insert(categoryTranslation).values({
      categoryId: row.id,
      locale: SOURCE_LOCALE,
      name: section.title,
      intro: empty(section.intro),
    })
    categories.set(section.slug, row.id)
  }
  console.log(`${categories.size} categories`)

  let done = 0
  let skipped = 0
  let sensitive = 0
  for (const section of sections) {
    const categoryId = categories.get(section.slug)!

    // Sensitivity is decided in document order over every photo, including the ones
    // already seeded, so a resumed run flags exactly the same set as a fresh one.
    let warned = false
    const pending: { item: Photo; isSensitive: boolean }[] = []
    for (const item of section.photos) {
      const isSensitive = warned
      if (WARNING_STARTS_HERE.test(item.caption)) warned = true
      if (known.has(item.slug)) skipped++
      else pending.push({ item, isSensitive })
    }

    await inBatches(pending.slice(0, Math.max(0, LIMIT - done)), CONCURRENCY, async (job) => {
      const { item, isSensitive } = job
      const data = readFileSync(join(ARCHIVE, 'originals', item.file))
      const sha256 = createHash('sha256').update(data).digest('hex')
      assert.equal(sha256, item.sha256, `${item.slug} does not match the hash T1 recorded`)

      // Everything reaches R2 before the row exists, so a row means a complete photo.
      const ext = item.file.split('.').pop()!
      const masterKey = masterKeyFor(newPrefix('masters', item.slug), ext)
      await put(masterKey, data, ext)

      const webPrefix = newPrefix('photos', item.slug)
      const { renditions } = await derive(data)
      await Promise.all(
        renditions.map((r) => put(keyFor(webPrefix, r.width, r.format), r.data, r.format)),
      )
      const largest = renditions.reduce((a, b) => (a.width >= b.width ? a : b))
      const narrowest = Math.min(...renditions.map((r) => r.width))

      await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(photo)
          .values({
            slug: item.slug,
            credit: empty(item.credit),
            yearFrom: item.year_from,
            yearTo: item.year_to,
            sensitive: isSensitive,
            masterSource: 'sites',
            masterKey,
            masterWidth: item.width,
            masterHeight: item.height,
            masterBytes: item.bytes,
            masterSha256: sha256,
            webKey: webPrefix,
            webWidth: largest.width,
            webHeight: largest.height,
            thumbKey: keyFor(webPrefix, narrowest, 'webp'),
          })
          .returning({ id: photo.id })
        await tx.insert(photoTranslation).values({
          photoId: row.id,
          locale: SOURCE_LOCALE,
          caption: empty(item.caption),
          notes: item.notes.length ? item.notes.join('\n') : null,
        })
        await tx
          .insert(photoCategory)
          .values({ photoId: row.id, categoryId, position: item.position })
      })

      if (isSensitive) sensitive++
      done++
      if (done % 25 === 0) console.log(`  ${done} seeded (${section.slug})`)
    })
  }

  // A category with no cover has nothing to show on the home page, and "the first
  // photo" is a better default than making T6 invent a fallback. The panel changes it.
  await db.execute(sql`
    update category c set cover_photo_id = (
      select pc.photo_id from photo_category pc
      where pc.category_id = c.id order by pc.position limit 1
    ) where c.cover_photo_id is null
  `)
  if (LIMIT === Infinity) {
    const uncovered = await db
      .select({ slug: category.slug })
      .from(category)
      .where(isNull(category.coverPhotoId))
    assert.equal(uncovered.length, 0, 'every category ended up with a cover photo')
  }

  console.log(`\nseeded ${done} photos (${skipped} already there), ${sensitive} flagged sensitive`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => client.end())
