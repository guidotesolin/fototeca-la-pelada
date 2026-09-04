import { sql } from 'drizzle-orm'
import {
  boolean,
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

/**
 * The archive's schema. Three archival principles hold it up, all three from
 * ARCHITECTURE: the master is the document, an AI restoration is an
 * interpretation and never replaces it, and anything that is not language is
 * not translated.
 *
 * Column names are written out in snake_case rather than left to a `casing`
 * option, because that option has to be repeated identically in drizzle-kit
 * and in every client, and a mismatch breaks queries at runtime.
 */

/** Postgres has no tsvector type in Drizzle. A trigger fills the column: see `drizzle/0001_*.sql`. */
const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' })

/** The public site's languages. Spanish is the source and the fallback. */
export const locale = pgEnum('locale', ['es', 'en', 'fr', 'it'])

/** Where the preservation master lives. 'sites' is the copy rescued in T1. */
export const masterSource = pgEnum('master_source', ['sites', 'drive'])

export const category = pgTable('category', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  slug: varchar({ length: 64 }).notNull().unique(),
  position: integer().notNull().default(0),
  visible: boolean().notNull().default(true),
  // The photo that represents the section on the home page.
  coverPhotoId: integer('cover_photo_id').references(() => photo.id, { onDelete: 'set null' }),
})

export const categoryTranslation = pgTable(
  'category_translation',
  {
    categoryId: integer('category_id')
      .notNull()
      .references(() => category.id, { onDelete: 'cascade' }),
    locale: locale().notNull(),
    name: text().notNull(),
    // The section's own introduction, which is where the Campo notice lives.
    intro: text(),
  },
  (t) => [primaryKey({ columns: [t.categoryId, t.locale] })],
)

export const photo = pgTable(
  'photo',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    /** Permanent identifier: `/foto/espacios-001` survives the photo changing category. */
    slug: varchar({ length: 64 }).notNull().unique(),
    /** "Cortesía: ..." — the family who lent it. Neutral, so never translated. */
    credit: text(),
    /** Where the research came from: the Centenary book, an interview. */
    source: text(),
    yearFrom: integer('year_from'),
    yearTo: integer('year_to'),
    place: text(),
    /** Covered on first appearance, never hidden. See "Sensitive content". */
    sensitive: boolean().notNull().default(false),
    featured: boolean().notNull().default(false),
    published: boolean().notNull().default(true),

    // --- preservation master ---
    masterSource: masterSource('master_source').notNull(),
    /** Null while the master is the copy rescued from Sites. */
    driveFileId: text('drive_file_id'),
    masterKey: text('master_key'),
    masterWidth: integer('master_width').notNull(),
    masterHeight: integer('master_height').notNull(),
    masterBytes: integer('master_bytes').notNull(),
    masterSha256: varchar('master_sha256', { length: 64 }).notNull(),

    // --- web derivatives (R2). Keys carry a random component: a takedown must
    // not leave the rest of the archive derivable from one URL. ---
    webKey: text('web_key'),
    webWidth: integer('web_width'),
    webHeight: integer('web_height'),
    thumbKey: text('thumb_key'),

    // --- optional AI restoration: an interpretation, not the document ---
    restoredDriveFileId: text('restored_drive_file_id'),
    /**
     * The restoration's own master, under the same principle as the photograph's:
     * the master is the document and the derivatives are regenerable. Without it a
     * takedown would delete the restored derivatives and republishing could not
     * bring them back, so the retouching work would be lost by unpublishing --
     * which is a takedown destroying research, exactly what "Exposure" promises it
     * does not do.
     */
    restoredMasterKey: text('restored_master_key'),
    restoredWebKey: text('restored_web_key'),
    /**
     * The restoration's own rendition size. It is derived from its own master, so
     * its widths are its own: rendering it at the photograph's `web_width` asks R2
     * for files that were never encoded. F28 called this safe while a restoration
     * was a re-render of the same scan; the panel accepts arbitrary uploads now.
     */
    restoredWebWidth: integer('restored_web_width'),
    restoredWebHeight: integer('restored_web_height'),
    restoredThumbKey: text('restored_thumb_key'),
    restoredAt: timestamp('restored_at', { withTimezone: true }),
  },
  (t) => [
    /**
     * **The Drive import's idempotency, given by Postgres.** Re-importing a
     * folder must not duplicate a photograph, and the import does check before
     * it writes -- but a check that reads before it writes is a race, not a
     * guarantee, and the thing it guards is 600 irreplaceable scans. The
     * constraint is where the promise lives; the check is only there to give a
     * better message than a constraint violation.
     *
     * Partial, because the 592 rescued from Sites all carry null here. Postgres
     * treats nulls as distinct in a unique index anyway, so the predicate
     * changes no behaviour -- it says out loud that null means "no Drive master"
     * rather than "one more row competing for the same value", and it keeps 592
     * dead entries out of the index.
     */
    uniqueIndex('photo_drive_file_id_key')
      .on(t.driveFileId)
      .where(sql`${t.driveFileId} is not null`),
  ],
)

export const photoTranslation = pgTable(
  'photo_translation',
  {
    photoId: integer('photo_id')
      .notNull()
      .references(() => photo.id, { onDelete: 'cascade' }),
    locale: locale().notNull(),
    caption: text(),
    notes: text(),
    /** Written by a trigger, not by application code, so no save path can forget it. */
    searchVector: tsvector('search_vector'),
  },
  (t) => [
    primaryKey({ columns: [t.photoId, t.locale] }),
    index('photo_translation_search_idx').using('gin', t.searchVector),
  ],
)

/** N:N: a photo can sit in both Familias and Casamientos. */
export const photoCategory = pgTable(
  'photo_category',
  {
    photoId: integer('photo_id')
      .notNull()
      .references(() => photo.id, { onDelete: 'cascade' }),
    categoryId: integer('category_id')
      .notNull()
      .references(() => category.id, { onDelete: 'cascade' }),
    position: integer().notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.photoId, t.categoryId] }),
    // The gallery query: one category, in curatorial order.
    index('photo_category_gallery_idx').on(t.categoryId, t.position),
  ],
)

/**
 * The Videoteca: the interviews with neighbours that live on the archive's own
 * YouTube channel. A table and not a `site_text` key, because it is a list that
 * grows, each item carries a title per language, and each item is published or
 * hidden on its own -- none of which fits in a keyed string without becoming a
 * blob nothing can query.
 *
 * **It stores the video's id and never a URL.** The embed address is built in
 * code from the id, so the panel cannot point the iframe anywhere: an allowlist
 * enforced by construction beats accepting a URL and sanitising it. Sixteen
 * characters against YouTube's eleven leaves room and no more.
 *
 * **No master, and that is principle 1 rather than an omission.** The master is
 * the document, and this document is the video, which lives on YouTube. What is
 * stored here is the poster, downloaded once when the video is added and put
 * through the same pipeline as any photograph so the page asks Google for
 * nothing until somebody presses play. It is a derivative of something the
 * archive does not hold, regenerable by downloading it again, so it needs
 * neither `master_source` nor `readMaster`.
 *
 * The four derivative columns carry `photo`'s own names on purpose: a row here
 * then satisfies `PhotoCard`, and `PhotoImage` draws the poster with the whole
 * AVIF/WebP ladder and zero layout shift with no component of its own.
 */
export const video = pgTable('video', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  slug: varchar({ length: 64 }).notNull().unique(),
  youtubeId: varchar('youtube_id', { length: 16 }).notNull(),
  position: integer().notNull().default(0),
  published: boolean().notNull().default(true),
  // The poster, in R2. `web_key` is a prefix; `thumb_key` is a whole key.
  webKey: text('web_key'),
  webWidth: integer('web_width'),
  webHeight: integer('web_height'),
  thumbKey: text('thumb_key'),
})

/**
 * **Both fields are nullable, like `photo_translation`'s and unlike
 * `category_translation`'s, and that is a correction rather than a preference.**
 *
 * The first version made `title` `NOT NULL`, copying the section's shape, and
 * `writeTranslations` therefore refused a description whose title was left blank.
 * That is exactly the state this archive's interviews are in: the title is
 * "Memorias de La Pelada -- <a person's name>", which is a series and a name and
 * so the same in four languages, while the description is prose that is not. The
 * rule made translating the description impossible without inventing a
 * translation of a proper noun, which the glossary exists to prevent. Found by
 * running `translations:load`, which refused all three.
 *
 * So "not translated" here is a null, the public read's
 * `coalesce(nullif(...), ...)` falls back to Spanish field by field, and the
 * Spanish row's title is non-null because the panel refuses to write one without.
 *
 * The id is not language and is therefore not here; see principle 3. No
 * `search_vector` and no trigger: `/buscar` is over the photographs' captions.
 */
export const videoTranslation = pgTable(
  'video_translation',
  {
    videoId: integer('video_id')
      .notNull()
      .references(() => video.id, { onDelete: 'cascade' }),
    locale: locale().notNull(),
    title: text(),
    description: text(),
  },
  (t) => [primaryKey({ columns: [t.videoId, t.locale] })],
)

/**
 * Text that belongs to the site rather than to a photograph or a section: the
 * archive's own description, the rights notice, who made it. It is content, so it
 * lives here and is edited from the panel — the alternative is prose frozen inside
 * a component, which means a deploy to fix a comma and a maintainer to ask.
 */
export const siteText = pgTable(
  'site_text',
  {
    key: varchar({ length: 64 }).notNull(),
    locale: locale().notNull(),
    value: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.key, t.locale] })],
)

/** `app_user`, because `user` is reserved in Postgres. Everyone listed is an admin. */
export const appUser = pgTable('app_user', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  email: text().notNull().unique(),
  name: text(),
})
