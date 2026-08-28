# Fototeca La Pelada — Architecture

> Source of truth for the design. The task board lives in [TASKS.md](./TASKS.md).
> Each task is executed by an independent session that reads these two documents and nothing else.

## Context

Lautaro and Marcos Tesolín (history teachers) maintain the photographic archive of La Pelada,
Santa Fe, Argentina, on a Google Sites site. It holds **617 images across 12 sections**, each with
a caption and a credit naming the family that lent the photo ("Cortesía: ..."), plus source notes
from the town's Centenary book and video interviews with residents.

Google Sites imposes three limits that motivate the move:

1. No per-photo URL, so nothing is shareable, citable, or individually indexable.
2. No search and no filters, which makes 617 photos effectively unbrowsable.
3. Metadata is loose text under each image, so the research work is not data.

Goal: an application where the archive is **searchable**, where **the brothers administer it
themselves** with Google sign-in and manageable categories, and which is ready to be **translated
into English, French and Italian** — the main migrant origins of the town, for descendants abroad.

### Three findings from inspecting the current site

- **The images on Sites are the originals as uploaded.** Requesting `=s0` returns widths from 471
  to 1751 px, all distinct, one of them above the 1280 px the page itself requests. No value
  repeats, which is what an imposed cap would look like. The quality loss happened **before**
  upload, not in Sites. Sample of 8 images; T1 confirms this via Takeout. Implication: there is no
  better copy hidden inside Google — the good ones, if any, are with whoever did the scanning.
- **The captions are the valuable asset, not the photos.** Who appears, which corner it is, what
  year, who lent it: that is research done by hand, and it can be rescued in full and
  automatically because the Sites HTML is perfectly regular (image → caption → "Cortesía: X").
- **There is a paid 5 TB Google Drive.** It solves where high-resolution scans live, but as a
  master vault, not as an image server.

---

## Language conventions

A three-tier rule, because the project has three distinct audiences:

| Layer                                                                                                                  | Language                                                       | Why                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **All code and documentation**: identifiers, tables, columns, comments, commit messages, branch names, `docs/`, README | **English**                                                    | The brothers will never touch code. English is the language of the stack and avoids hybrids like `getFotoBySlug`. |
| **Public site**                                                                                                        | **Localized**: Spanish first, then English, French and Italian | This is the product. Spanish is the source language and the fallback when a translation is missing.               |
| **Admin panel**                                                                                                        | **Spanish, never translated**                                  | Only the two of them use it. It carries no i18n machinery: strings are written directly in Spanish.               |

Practical consequence: `next-intl` wraps only the public `/[locale]` routes. `/admin` stays
outside the localization system.

Public routes stay in Spanish (`/categoria`, `/foto`, `/buscar`) because they are user-facing
content for a Spanish-language audience and carry SEO weight. Admin routes are in English because
they are internal.

---

## Layers

| Layer          | Choice                                   | Why                                                                                                                                                                                   |
| -------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend       | **Next.js 16 (App Router) + TypeScript** | Where the maintainer has the most experience, which in a one-person project is the highest risk factor. RSC pre-renders the public site and leaves the admin dynamic in a single app. |
| Styling        | **Tailwind CSS**                         | Fast visual iteration, which is what the design-proposal stage needs.                                                                                                                 |
| Database       | **Neon** (Postgres, free tier)           | Manageable categories, N:N photo↔category, translations, and native per-language full-text search.                                                                                    |
| ORM            | **Drizzle**                              | Transparent SQL, no binary engine, fast cold start on serverless. Visible SQL matters in a project meant to last years.                                                               |
| **Masters**    | **Google Drive** (5 TB, already paid)    | Preservation vault: scans at maximum quality. Never served to the public.                                                                                                             |
| **Web images** | **Cloudflare R2** (10 GB, free tier)     | Derivatives only, served from `img.fototecalapelada.com.ar`. 10 GB free and **free egress**: a gallery is pure egress.                                                                |
| Auth           | **Auth.js v5 + Google**                  | They sign in with their Gmail or the archive's account. The same OAuth grants Drive access.                                                                                           |
| i18n           | **next-intl**, routes `/es /en /fr /it`  | Public site only. Translations live in the database, falling back to Spanish.                                                                                                         |
| Hosting        | **Vercel** (Hobby)                       | Native Next.js and GitLab integration. The project is non-profit, so it complies with the non-commercial use policy.                                                                  |
| Repo           | **GitLab**                               | What the maintainer already uses.                                                                                                                                                     |

### Next.js vs Astro: the honest comparison

For a photographic archive — 99% reading, heavy on content, light on interaction — **Astro is the
best frontend available**: it ships zero JavaScript by default. Next.js, even fully in Server
Components, carries a framework baseline on the order of 90 KB compressed.

> **Next 16, not 15.** `create-next-app@latest` installs 16.3.3. Next 16 warns in `AGENTS.md` that
> it has breaking changes relative to the versions models were trained on, and asks that
> `node_modules/next/dist/docs/` be read before writing code. **Every task session that touches
> Next code must read those docs first.**

**Decision: Next.js for everything**, for three reasons:

1. **One person will maintain this for years.** Fluency in the stack is the single most important
   survival factor for a volunteer project.
2. **The admin panel is not an accessory, it is half the application**: sign-in, forms, uploads,
   Drive import, catalogs. That is where Next is strong and Astro awkward.
3. **The 90 KB is small next to the images.** A gallery of 20 thumbnails weighs roughly 600 KB, so
   the framework is about 13% of it. Every lever that actually moves mobile performance is
   available in Next.

The alternative is recorded in case embedded-browser performance ever becomes the dominant
problem: **Astro for the public site + Next for the admin**, in a monorepo. The data model does
not tie our hands about making that switch.

### Why Drive stores but does not serve

Serving photos straight from Drive is not viable, for three independent reasons:

1. **It is blocked.** `drive.google.com/uc?export=view&id=...` has returned 403 since January
   2024: Google deliberately cut hotlinking to external domains. The workaround that circulates
   (`/thumbnail?id=...&sz=w1000`) is rate-limited and fails precisely when a page holds many
   images — which is exactly what a gallery is.
2. **Per-file download quota.** When a photo becomes popular, Drive answers "too many users have
   viewed or downloaded this file recently". On a public site that is an outage.
3. **The Drive API terms forbid it**: using Drive as a CDN replacement is not permitted.

| Where                          | What it holds                                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| **Drive** — 5 TB, already paid | Preservation masters: scans at maximum quality. Never served to the public. 5 TB fits tens of thousands. |
| **R2** — 10 GB, free           | Only the derivatives the site consumes: AVIF and WebP at three widths. ≈ 270 MB for the current 617.     |

### The bridge: importing from Drive in the admin panel

The same Google OAuth they use to sign in also reads Drive (`drive.readonly` scope), so it is a
single authorization. For unattended server access, a **service account** with the folder shared
to its address is preferable: it does not expire and is read-only. Flow:

1. The brothers drop scans into a Drive folder — the gesture they already know.
2. In the panel they pick the folder; the server lists its files through the Drive API.
3. For each photo: download the master, generate derivatives with `sharp`, upload them to R2.
4. The database keeps the master's `drive_file_id`, its hash and its real dimensions.

The master is never lost or duplicated. Drive API egress quota is not a concern because it is only
used for occasional imports, never to serve traffic.

### Cross-cutting decision: the public site is pre-rendered

Public pages are statically generated with ISR and revalidated **when the panel publishes a
change** (`revalidateTag`), not on every visit. The database is therefore barely touched in
production, which removes the risk from Neon's free tier (100 CU-hours/month, which **suspends the
database when exceeded**). It also means the site responds from CDN, which matters on slow
connections.

### Cross-cutting decision: image variants are generated at import time

Vercel Hobby includes only 5,000 image transformations per month; with 617 photos and several
sizes that is exhausted on Google's first crawl. So variants are generated once with `sharp` at
import (AVIF and WebP, three widths), stored in R2, and served straight from CDN via `<picture>`
and `srcset`. **Vercel quota usage: zero.** And because encoding is paid once, outside the request
path, we can afford AVIF, the lightest format.

---

## Mobile first

This is not an aesthetic preference, it is where the traffic will come from. People will arrive
through links shared on Facebook, Instagram and WhatsApp, which open in those apps' embedded
browsers, on a phone, often on rural mobile data.

**Hard requirement: the photo and its caption must be visible without JavaScript.** Embedded
browsers are old and unpredictable. All archive content is server-rendered; JavaScript only adds
conveniences (revealing a sensitive image, switching original/restored, instant filtering). If it
fails, the archive is still readable.

**Images are most of the weight, so that is where the fight is:**

| Decision                                                   | Why                                                                                                                  |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **AVIF + WebP** via `<picture>`                            | AVIF is roughly 30% smaller than WebP at equal quality, and we can afford it because it is generated once at import. |
| `srcset` + `sizes` at three widths                         | A 360 px phone never downloads a 1200 px image.                                                                      |
| `width`/`height` and `aspect-ratio` from stored dimensions | **Zero layout shift.** Scrolling a gallery on a phone, that is the difference between usable and infuriating.        |
| `loading="lazy"` except the first row                      | Do not fetch 20 thumbnails to show 4.                                                                                |

**Galleries without JavaScript.** Two columns on a phone, with per-photo `aspect-ratio` resolved
in pure CSS. No client-side masonry. And **pagination with real URLs**
(`/categoria/campo?p=2`) instead of infinite scroll: infinite scroll breaks the back button,
accumulates memory, and cannot be shared or indexed.

**The photo detail page, which is the main screen.** Full-width image, caption immediately below
in legible type, credit visible rather than buried. Pinch zoom **is not disabled**: someone will
want to look closely at a face, and blocking that is an accessibility failure. Previous and next
as real server-rendered links.

**The original/restored switch is two A/B buttons, not a drag slider.** A drag slider on a
touchscreen fights with page scrolling.

**Search runs on the server**, with results rendered and cached per query at the CDN. That avoids
shipping a ~90 KB search index paid for with mobile data, and the result gets a shareable,
indexable URL. It is also the only place the database is touched per visit, so if Neon's limit
ever bites, this is where to look.

**Typography**: a single display family for headings, subset to Latin, with `font-display: swap`;
body text on the system stack.

**The panel works on a phone too**, but with priorities: bulk loading happens from Drive on a
computer, and what must work well on a phone is fixing a caption and flagging a photo as
sensitive.

---

## Data model

This is the durable decision: the stack can change, this cannot. **All identifiers in English.**
Three archival principles:

1. **The master is the document.** It is stored untouched with its SHA-256, in Drive when a scan
   exists. Web variants are derived and regenerable at any time.
2. **An AI restoration is an interpretation, not the document.** It lives in separate fields, never
   replaces the master, and the default view is always the original.
3. **Anything that is not language is not translated.** Credit, years and place are neutral; only
   `caption` and `notes` are translated.

```
category                         category_translation
  id                               category_id ──┐
  slug            unique           locale        │ pk
  position                         name          │
  visible                          intro ────────┘
  cover_photo_id

photo                            photo_translation
  id                               photo_id ─────┐
  slug            unique           locale        │ pk
  credit            -- "Cortesía"  caption       │
  source            -- the book    notes         │
  year_from         -- filters     search_vector ┘  tsvector, written on each save
  year_to
  place
  sensitive         -- bool; see "Sensitive content"
  featured          -- bool; appears on the home page
  published
  -- preservation master
  master_source     -- 'drive' | 'sites'
  drive_file_id     -- null while the master comes from the Sites rescue
  master_key        -- R2 key of the rescued master, when there is no scan
  master_width / master_height / master_bytes / master_sha256
  -- web derivatives (R2)
  web_key / web_width / web_height
  thumb_key
  -- optional AI restoration
  restored_drive_file_id / restored_web_key / restored_thumb_key
  restored_method / restored_at

photo_category                   app_user
  photo_id ─────┐ pk               id
  category_id ──┘                  email unique
  position                         name
```

Details that matter:

- **`master_source` + `drive_file_id`**: today the best available master is the copy rescued from
  Sites. When the real scan is uploaded, `master_source` becomes `'drive'`, derivatives are
  regenerated, and **not a single metadata field is touched**.
- **`year_from`/`year_to`** feed the decade filter. The text as they wrote it ("circa 1960",
  "década del 40") already lives in the `caption`, so it needs no field of its own.
- **`photo_category` is N:N**: a photo can sit in both Familias and Casamientos. A real improvement
  over Sites, where each photo lives on exactly one page.
- **Stable `slug`** (`espacios-001`): the permalink `/foto/espacios-001` does not change even if
  the photo moves between categories. A permanent identifier, standard archival practice.
- **`app_user`, not `user`**: `user` is a reserved word in Postgres.
- **The home page is organized with fields that already exist**: the section list comes from
  `category.position` (order), `category.visible` (show or hide) and `category.cover_photo_id`
  (which photo represents it). The only new field is `photo.featured` for the highlights strip.
  Highlights have no order of their own: they follow category order, and a `featured_position`
  gets added when that default becomes annoying.
- **Search**: `tsvector` with Postgres dictionaries (`spanish`, `english`, `french`, `italian`)
  plus the `unaccent` extension, so that "Tesolin" finds "Tesolín".

### Ponytail pass

The **ponytail** plugin (YAGNI, no abstractions nobody asked for) applies to design too, which is
where it is cheapest. Cut from the model:

| Cut                                            | Replacement                                                    | When to add it                                     |
| ---------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------- |
| `content_warning` catalog + translations + N:N | `photo.sensitive` boolean; the text lives in the message files | When a **second** kind of warning appears          |
| `audit_log`                                    | Nothing                                                        | When they genuinely need to trace who changed what |
| `photo.position`                               | Order lives in `photo_category.position`                       | Never: it was a second ordering for the same thing |
| `app_user.role`                                | Everyone who signs in is an admin                              | When a second role exists                          |
| `photo.date_text`                              | The text is already in the `caption`                           | Never                                              |
| `photo.lqip`                                   | `width`/`height` + `aspect-ratio` already give zero CLS        | If the grey placeholder actually bothers anyone    |

Kept, with reasons, despite ponytail's objection:

- **Translation tables**, even though not one translation exists yet: this is not speculation, it
  is a stated requirement, and it is schema — retrofitting forces migrating every row and
  rewriting every query.
- **The master/derivative split**: it is the archival principle and the migration path to Drive.

---

## Sensitive content

Today the Campo section handles this with a paragraph at the top of the page: _"Al final de esta
sección se encuentran fotografías de carneadas. Algunas imágenes pueden herir la sensibilidad de
ciertas personas."_ (A _carneada_ is a rural animal-butchering gathering.) That fails in three
ways the new site would make worse:

1. **It depends on position.** "At the end of this section" stops being true the moment search,
   decade filters or reordering exist.
2. **It does not cover direct access.** With a per-photo URL, someone can land on
   `/foto/campo-078` from Facebook without ever seeing the notice.
3. **It is all-or-nothing per section.**

So the warning is **a property of the photo** — `photo.sensitive` — and travels with it. The text
lives in the message files, translated once, because today exactly one kind of warning exists:

| Where                      | Behavior                                                                                                                                                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gallery grid               | Blurred thumbnail with a restrained label. One click reveals it. Not hidden: blurring gives informed choice, hiding would erase the archive.                                                 |
| Photo detail page          | A card with the text **before** the image, the image blurred behind it, and a "Ver la fotografía" button. This is what fixes direct access.                                                  |
| Search results             | Same as the grid. **Decision: sensitive photos appear everywhere, blurred** — excluding them from search would create the incoherence of searching "carneada" and not finding the carneadas. |
| Viewer preference          | A "show sensitive images unblurred" toggle, remembered in `localStorage`. A researcher does not click 30 times; a casual visitor keeps them covered.                                         |
| Sharing and search engines | If a photo is sensitive it is **never used as `og:image`**, and its page carries `noimageindex`.                                                                                             |

The per-section intro still exists (`category_translation.intro`), so they can keep the notice they
wrote as context. It is no longer the mechanism, just courtesy.

**Wording criterion**, which matters in a historical archive: the warning describes, it does not
judge. "Contains images of animal butchering", not "disturbing content". A carneada is a legitimate
part of rural life and of the town's historical record; it belongs in the archive. The photo is
**never deleted or hidden**: only its first appearance is covered.

---

## Exposure, indexing and takedown on request

**Decision: an open archive with an escape valve.** Everything is indexed, because that is the
point of a public archive and it is what will let a descendant in Italy find their
great-grandfather's photo. But captions name living people, and while Sites is nearly invisible to
Google, the new site will not be.

How a takedown works:

1. Panel → the photo → unpublish (`published = false`).
2. The detail page starts answering 410, drops out of galleries, search and sitemap, and the
   affected routes are revalidated.
3. **Derivatives are deleted from R2.** If we only removed it from listings, the image file would
   remain reachable at its URL and the takedown would be a lie.
4. The master stays intact in Drive and the metadata in the database: none of the research work is
   lost. Republishing regenerates the derivatives.

Two technical consequences that must be decided before writing code, not after:

- **R2 keys cannot be guessable.** If they were `photos/campo-078/web.avif`, anyone could derive
  the rest of the archive and the takedown would be a lie again. They carry a random component per
  photo.
- **Google keeps cached copies.** Unpublishing does not remove it from the index immediately; that
  needs the Search Console removal tool. It is procedure, not code, and it should be written down
  so the brothers can do it without the maintainer.

The `/sobre` page carries the contact address (fototecalp@gmail.com) with an explicit line on how
to request a correction or a takedown.

**No people table: search is enough.** Names live inside captions as loose text, and people and
places coexist there — "María Luisa" is a locality, not a person. A `person` table built from
captions would be born dirty. The full-text search in T8 does not classify: it searches text, finds
both, and the reader disambiguates instantly.

---

## Security

**No secret enters the repository.** Concretely:

- `.env.local` is in `.gitignore`. The repo carries only `.env.example`, with variable **names** and
  obviously fake values. Note that `.gitignore` needs `!.env.example`, because a bare `.env*` rule
  swallows the example file too.
- **Never `NEXT_PUBLIC_` for a secret.** This is the classic Next footgun: anything prefixed
  `NEXT_PUBLIC_` is inlined into the client bundle and is public forever. The only public variables
  here are the site URL and the image URL.
- **R2 credentials**: server side only. The bucket is read through a public domain, but writing
  requires keys that never reach the client.
- **Drive service account**: the JSON never enters the repo. It travels as a base64 environment
  variable in Vercel and is decoded in memory.
- **`AUTH_SECRET`** generated with `openssl rand -base64 32`, different in development and
  production.
- **Neon connection string**: server only, never in a client component.
- **Admin allowlist in the database**, not in code: adding a brother must not require a deploy.
- **Secret detection in CI**: GitLab ships Secret Detection; plus a local `gitleaks` pre-commit
  hook, wired through git's native `core.hooksPath` so it needs no dependency.
- **If a secret leaks, rotate it — do not rewrite history.** Assume it has already been copied.

Security beyond keys:

- **Upload validation**: verify the real type by content, not by extension or by the header the
  client sends; enforce a size limit; reject anything `sharp` cannot decode.
- **Authorization on every panel endpoint**, checked on the server on every request. Hiding the UI
  is not enough.
- **CSP and security headers**, allowing only our own image domain.
- **Rate limiting** on write endpoints and on search.

---

## What can be changed without programming

The rule that organizes the whole design: **whatever is content lives in the database and is edited
from the panel; only behavior and layout live in code.** The Campo notice is the perfect example of
something that _looks_ like prose and is really structured data.

| Change                                            | How                                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Fix a caption, a year, a credit                   | Panel → the photo → save. Revalidates its detail page and the galleries it appears in.                 |
| Flag a photo as sensitive                         | Panel → the sensitive checkbox.                                                                        |
| Add, rename, hide or reorder a category           | Panel → categories. The public route appears or disappears on its own.                                 |
| Move a photo between categories, or put it in two | Panel → the photo. The relation is N:N.                                                                |
| Reorder photos within a category                  | Panel → drag (`photo_category.position`).                                                              |
| Organize the home page                            | Panel → Home: section order and visibility, each section's cover photo, and which photos are featured. |
| Change a section's intro text                     | Panel → category → intro, per language.                                                                |
| Add new photos                                    | Panel → import from Drive.                                                                             |
| Attach an AI restoration                          | Panel → the photo → restored version.                                                                  |
| Translate to English, French or Italian           | Panel → translations, which also lists what is missing.                                                |

These require touching code, and that is as it should be: visual design, viewer behavior, the
structure of the detail page, and adding a new language to the list.

---

## Rescuing the current archive

**There is no API for the new Google Sites**: the Sites API only reaches Classic Sites and is
deprecated. But **Google Takeout does export the new Sites to HTML + images**, which is what access
to the archive's Gmail account is for. The two routes are complementary:

| Route       | What it gives                                                                                                                              | Limits                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **Takeout** | The image files as Google stores them, in bulk, with no rate limiting and no terms-of-use grey area. Settles the real-resolution question. | Only sites in My Drive, not in shared drives. Exportable **once every 2 months**: the attempt should not be wasted. |
| **Scraper** | The metadata. In the live HTML the image → caption → "Cortesía: X" pattern is perfectly regular, verified across all 12 sections.          | The CDN rate-limits: after roughly 50 consecutive downloads it returns 403. Needs pacing and long backoff.          |

Order: **Takeout first** (because of the two-month quota and because it determines whether images
need downloading at all), **the scraper for metadata** (Takeout's export flattens the HTML and does
not guarantee preserving the photo↔caption↔credit association), and then **reconcile** by matching
document order, keeping the image bytes from whichever source carries the larger version.

Known counts to verify against: Espacios 72, Sociales 106, Campo 81, Trabajo 57, Deporte 55,
Familias 48, Educación 45, Eucaliptus 45, Religión 43, Inundación '78 33, Casamientos 29.

> `tools/extraer_sites.py` (298 lines) exists, written in Spanish and **never executed**. T1
> rewrites it in English as `tools/extract-sites.py` and adds rate-limit handling.

---

## Repository layout

```
fototeca-la-pelada/
├── docs/
│   ├── ARCHITECTURE.md            # this document
│   └── TASKS.md                   # the task board
├── src/
│   ├── app/
│   │   ├── [locale]/              # public, pre-rendered, localized
│   │   │   ├── page.tsx
│   │   │   ├── categoria/[slug]/
│   │   │   ├── foto/[slug]/
│   │   │   ├── buscar/
│   │   │   ├── creditos/
│   │   │   └── sobre/
│   │   ├── admin/                 # dynamic, authenticated, Spanish strings
│   │   │   ├── photos/
│   │   │   ├── import/
│   │   │   ├── categories/
│   │   │   └── translations/
│   │   └── api/
│   ├── db/{schema.ts,queries/}
│   ├── lib/{auth.ts,drive.ts,images.ts,r2.ts}
│   ├── components/
│   └── i18n/messages/{es,en,fr,it}.json
├── drizzle/                       # migrations
├── tools/
│   ├── extract-sites.py           # archive rescue
│   └── seed.ts                    # archive.json → Postgres + R2
└── archive/                       # raw rescue: permanent backup, never deleted
```

A single Next.js app, no monorepo: the panel is a route group sharing types and model with the
public site. Fewer moving parts, one deploy.

Directories are created by the task that needs them. Git does not track empty directories, so
scaffolding them up front would require `.gitkeep` files — pure ceremony.

---

## Costs

Everything sits on free tiers except the domain: Vercel Hobby, Neon, R2 (10 GB) and Auth.js are $0.
Drive is already paid and simply takes on a new role at no extra cost. The only new recurring
expense is the `.com.ar` domain at NIC Argentina, billed yearly.

Storage: derivatives for the 617 photos come to roughly **270 MB of R2's 10 GB**; masters go to
Drive, where 5 TB covers tens of thousands of scans.

---

## Risks

| Risk                                                         | Mitigation                                                                                                                                                            |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vercel Hobby is non-commercial use only**                  | The project is non-profit, so it complies. If it is ever monetized, it must move to Pro.                                                                              |
| **Neon's free tier suspends the database past 100 CU-hours** | The public site is pre-rendered: the database is touched on publish, not per visit. Search is the only point to watch.                                                |
| **Photos are 471–1751 px and that already is the original**  | The improvement is not in Google but in the source scans. `master_source` + `drive_file_id` allow replacing them without touching a single metadata field.            |
| **Google's CDN rate-limits**                                 | Confirmed in testing: after roughly 50 consecutive downloads it returns 403. T1 downloads with pacing and long backoff; Takeout avoids the problem entirely.          |
| **Publishing stops being instantaneous**                     | Revalidation is targeted and takes seconds, not a full rebuild.                                                                                                       |
| **Old Sites links will break**                               | Sites cannot redirect. Section slugs are preserved and a notice is left on the old site.                                                                              |
| **Translations are human work**                              | Partial translation is supported by design: fallback to Spanish, and the panel shows what is missing.                                                                 |
| **Photo rights**                                             | The current site states the photos were digitized with their owners' permission. That notice and the per-photo credit are preserved as a requirement, not decoration. |

---

## Verification

- **T1**: per-category counts against the table above; 10 records checked by hand against the live
  site; no photo left without a caption.
- **T4**: `select count(*)` per category against T1; SHA-256 of a sample against R2.
- **Mobile**: Lighthouse in mobile mode with simulated 3G over a gallery and a detail page, watching
  LCP and CLS; **browse with JavaScript disabled** and confirm photos, captions, pagination and
  search still work; open a shared link in Facebook's embedded browser on a real phone; and check
  that pinch zoom works.
- **Sensitive content**: flag a carneada and test all four paths — grid, search, direct link in a
  new window, and the WhatsApp link preview, which must not show the image.
- **Takedown**: unpublish and confirm 410, removal from galleries, search and sitemap, and that
  **the R2 URL stops responding**; then republish and verify derivatives are regenerated.
- **Panel**: sign in with an account outside the allowlist and confirm rejection; import a test
  Drive folder.
- **Security**: grep the generated client files for any key; run `gitleaks` over the full history.

---

## Still open

- **Visual identity**: decided in T5 with proposals in front of us.
- **Whether the Sites site sits in My Drive or a shared drive**, since that enables or rules out the
  Takeout route. Checked by signing in and searching `type:site` in Drive. Confirmed present in
  Drive; owner and location still to be verified in the details pane.
- **People as first-class entities**: dropped. Search covers the surname case, and captions mix
  people with places.
