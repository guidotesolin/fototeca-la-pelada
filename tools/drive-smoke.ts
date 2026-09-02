/**
 * Smoke test for T12: the Drive import, and the bug it had to close on the way.
 *
 * Three things are checked, and the second is the one that matters most.
 *
 * 1. **`isFileId`.** A folder id arrives from a form and ends up inside the `q`
 *    parameter of a Drive `files.list` call, where a quote would close the
 *    string and start something else. The shapes that must be refused are
 *    checked one by one.
 *
 * 2. **`readMaster` and `hasMaster`, which are the latent bug.** Republishing
 *    regenerates derivatives from the master, and the check used to ask for
 *    `master_key` -- R2 -- because all 592 photographs in the archive were
 *    rescued from Sites and had one. A photograph imported from Drive has
 *    `master_key` null and `drive_file_id` set, **permanently and by design**:
 *    the masters stay in Drive. So it could have been unpublished and never
 *    published again. The Drive-shaped row is asserted to have a master, and the
 *    R2-shaped one is read back from the real bucket and hashed against what the
 *    row says, which is the same round trip republishing makes.
 *
 * 3. **`nextPhotoSlug`**, against the real archive: the identifier a new
 *    photograph gets is the section's own address and the next free number, and
 *    it must not collide with a permalink that is already out there.
 *
 * The Drive half runs only when the service account is configured, and says so
 * when it is not, so this is useful before the Google Cloud Console work is
 * done. It never writes: no row is touched and nothing is uploaded.
 *
 *   npm run drive:smoke
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { photo } from '../src/db/schema'
import { isFileId, listFolders, listImages, mastersFolderId } from '../src/lib/drive'

try {
  process.loadEnvFile('.env.local')
} catch {
  // Fine: the variables may come from the environment instead.
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set: copy .env.example to .env.local and fill it in.')
  process.exit(1)
}

/** What `.env.example` ships, so a placeholder is not mistaken for a key. */
const PLACEHOLDER = 'example-drive-folder-id'

let checks = 0

function check(what: string, run: () => void) {
  run()
  checks++
  console.log(`  ok   ${what}`)
}

async function main() {
  // Imported here and not at the top: both modules build a client as they load --
  // the database one, and R2's -- and an `import` runs before the environment
  // file above is read. Same reason as `tools/search-smoke.ts`.
  const { db } = await import('../src/db')
  const { nextPhotoSlug } = await import('../src/db/queries/admin')
  const { hasMaster, readMaster } = await import('../src/lib/derivatives')

  console.log('isFileId')
  for (const good of ['0AbCdEfGhIjK', '1a2B3c4D5e6F7g8H9i0J-_kLmN', 'abcdefgh']) {
    check(`accepts ${good}`, () => assert.equal(isFileId(good), true))
  }
  for (const bad of [
    '',
    'short',
    "1abc' or trashed = false and '1'='1",
    '1abc def',
    '1abc/def',
    'a'.repeat(257),
    null,
    undefined,
    42,
  ]) {
    check(`refuses ${JSON.stringify(bad)}`, () => assert.equal(isFileId(bad), false))
  }

  console.log('\nhasMaster -- the shapes a row can take')
  const sites = { masterSource: 'sites' as const, masterKey: 'masters/x.jpg', driveFileId: null }
  const drive = { masterSource: 'drive' as const, masterKey: null, driveFileId: '1abcdefgh' }
  const both = {
    masterSource: 'drive' as const,
    masterKey: 'masters/x.jpg',
    driveFileId: '1abcdefgh',
  }
  const none = { masterSource: 'sites' as const, masterKey: null, driveFileId: null }

  check('a rescued master is readable', () => assert.equal(hasMaster(sites), true))
  // The regression this whole check exists for: the old guard was
  // `!row.masterKey`, which is exactly what a Drive import leaves null.
  check('a Drive master is readable', () => assert.equal(hasMaster(drive), true))
  check('a row holding both is readable', () => assert.equal(hasMaster(both), true))
  check('a row holding neither is not', () => assert.equal(hasMaster(none), false))
  await assert.rejects(() => readMaster(none), /no master/)
  checks++
  console.log('  ok   readMaster refuses a row with no master')

  console.log('\nreadMaster against the real bucket')
  const [rescued] = await db
    .select({
      slug: photo.slug,
      masterSource: photo.masterSource,
      masterKey: photo.masterKey,
      driveFileId: photo.driveFileId,
      masterSha256: photo.masterSha256,
      masterBytes: photo.masterBytes,
    })
    .from(photo)
    .where(and(eq(photo.masterSource, 'sites'), isNotNull(photo.masterKey)))
    .orderBy(photo.slug)
    .limit(1)
  assert.ok(rescued, 'the archive has no rescued master to read')
  const bytes = await readMaster(rescued)
  check(`${rescued.slug} reads back ${bytes.byteLength} bytes`, () =>
    assert.equal(bytes.byteLength, rescued.masterBytes),
  )
  check('and the bytes hash to what the row says', () =>
    assert.equal(createHash('sha256').update(bytes).digest('hex'), rescued.masterSha256),
  )

  console.log('\nnextPhotoSlug against the real archive')
  const sections = await db.execute<{ slug: string }>(sql`select slug from category order by slug`)
  for (const { slug } of sections) {
    const next = await nextPhotoSlug(slug)
    assert.match(next, new RegExp(`^${slug}-\\d{3,}$`), `${next} is not <section>-NNN`)
    const [taken] = await db.select({ slug: photo.slug }).from(photo).where(eq(photo.slug, next))
    check(`${slug} -> ${next}, free`, () => assert.equal(taken, undefined))
  }

  console.log('\nDrive')
  if (
    !process.env.GOOGLE_DRIVE_MASTERS_FOLDER_ID?.trim() ||
    process.env.GOOGLE_DRIVE_MASTERS_FOLDER_ID === PLACEHOLDER
  ) {
    console.log('  --   not configured yet: GOOGLE_DRIVE_MASTERS_FOLDER_ID is unset or the example')
    console.log('       value. See "Importing from Drive" in the README.')
  } else {
    const root = mastersFolderId()
    const folders = await listFolders(root)
    console.log(`  ok   the masters folder answers, with ${folders.length} folders inside`)
    checks++
    const images = await listImages(root)
    console.log(`  ok   ${images.length} images directly in it`)
    checks++
    // All of them, not a sample: this is the inventory of the vault, and which
    // folder to import next is exactly what somebody runs this to find out.
    let inVault = images.length
    for (const folder of folders) {
      const inside = await listImages(folder.id)
      inVault += inside.length
      console.log(`       ${folder.name.padEnd(24)} ${String(inside.length).padStart(4)} images`)
    }
    console.log(`  ok   ${inVault} images in the vault, across ${folders.length + 1} folders`)
    checks++
    /**
     * The other half of check 2, and the one that cannot run until a folder has
     * actually been imported: a **Drive** master read back through the same door
     * republishing uses, hashed against what the row recorded. This is the
     * assertion that says the latent bug is closed rather than merely refactored.
     */
    const [imported] = await db
      .select({
        slug: photo.slug,
        masterSource: photo.masterSource,
        masterKey: photo.masterKey,
        driveFileId: photo.driveFileId,
        masterSha256: photo.masterSha256,
        masterBytes: photo.masterBytes,
      })
      .from(photo)
      .where(isNotNull(photo.driveFileId))
      .orderBy(photo.slug)
      .limit(1)
    if (!imported) {
      console.log('  --   nothing imported yet, so there is no Drive master to read back')
    } else {
      check(`${imported.slug} has no master_key, as designed`, () =>
        assert.equal(imported.masterKey, null),
      )
      check('and it still counts as having a master', () => assert.equal(hasMaster(imported), true))
      const master = await readMaster(imported)
      check(`its master reads back from Drive: ${master.byteLength} bytes`, () =>
        assert.equal(master.byteLength, imported.masterBytes),
      )
      check('and hashes to what the row says', () =>
        assert.equal(createHash('sha256').update(master).digest('hex'), imported.masterSha256),
      )
    }
  }

  console.log(`\n${checks} checks pass`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  // The app's database client is never closed: it is built for a long-lived
  // server, not for a CLI, so this script leaves rather than waiting on it.
  .finally(() => process.exit(process.exitCode ?? 0))
