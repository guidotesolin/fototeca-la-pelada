# Fototeca La Pelada — Architecture

> Source of truth for the design. The task board lives in [TASKS.md](./TASKS.md).
> Each task is executed by an independent session that reads these two documents and nothing else.

## Context

Lautaro and Marcos Tesolín (history teachers) maintain the photographic archive of La Pelada,
Santa Fe, Argentina, on a Google Sites site. It holds **592 photographs across 11 sections**,
nearly all with a caption and a credit naming the family that lent the photo ("Cortesía: ..."),
plus source notes from the town's Centenary book and video interviews with residents.

Google Sites imposes three limits that motivate the move:

1. No per-photo URL, so nothing is shareable, citable, or individually indexable.
2. No search and no filters, which makes 592 photos effectively unbrowsable.
3. Metadata is loose text under each image, so the research work is not data.

Goal: an application where the archive is **searchable**, where **the brothers administer it
themselves** with Google sign-in and manageable categories, and which is ready to be **translated
into English, French and Italian** — the main migrant origins of the town, for descendants abroad.

### Three findings from inspecting the current site

- **Sites keeps the pixels it was given, and re-encodes them.** T1 measured all 592: `=s0` returns
  widths from 300 to 2340 px, 413 distinct values, well above the 1280 px the page itself requests.
  No cap. The quality loss happened **before** upload. The Takeout export confirmed it from the
  other side: 497 of the 649 images in the Drive working folder have exactly the pixel dimensions
  of a published photo, but only 4 are byte-identical, so Sites recompresses on upload. That leaves
  a slightly better _encode_ of the same pixels in Drive for about 210 photos — worth nothing once
  T3 re-encodes everything to AVIF. Implication unchanged: there is no better copy hidden inside
  Google, and the good ones, if any, are with whoever did the scanning.
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
| Hosting        | **Vercel** (Hobby)                       | Native Next.js and GitHub integration. The project is non-profit, so it complies with the non-commercial use policy.                                                                  |
| Repo           | **GitHub** (public)                      | `github.com/guidotesolin/fototeca-la-pelada`. Public, which makes secret scanning and push protection free and on by default.                                                         |

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

T6 measured it, and the number is worth keeping. A gallery of 24 photographs, median of three
Lighthouse runs each: on the standard mobile profile (slow 4G, 150 ms RTT) it scores 98 with
LCP 2.3 s and CLS 0 — green on both. Held to fast 3G latency instead (562 ms RTT), CLS stays at 0
and LCP goes to 5.1 s. Unthrottled, first paint is 109 ms, so what the simulation is pricing is
round trips and bandwidth contention, and the largest thing contending is **137 KB of framework
JavaScript on a page with no interactivity at all** — 47 KB above the estimate this section was
written with. That is the condition under which the Astro alternative stops being theoretical.

### Why Drive stores but does not serve

Serving photos straight from Drive is not viable, for three independent reasons:

1. **It is blocked.** `drive.google.com/uc?export=view&id=...` has returned 403 since January
   2024: Google deliberately cut hotlinking to external domains. The workaround that circulates
   (`/thumbnail?id=...&sz=w1000`) is rate-limited and fails precisely when a page holds many
   images — which is exactly what a gallery is.
2. **Per-file download quota.** When a photo becomes popular, Drive answers "too many users have
   viewed or downloaded this file recently". On a public site that is an outage.
3. **The Drive API terms forbid it**: using Drive as a CDN replacement is not permitted.

| Where                          | What it holds                                                                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Drive** — 5 TB, already paid | Preservation masters: scans at maximum quality. Never served to the public. 5 TB fits tens of thousands.                                       |
| **R2** — 10 GB, free           | The derivatives the site consumes, plus the rescued masters until real scans exist: 242 MB for the current 592, measured after T4 seeded them. |

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

Vercel Hobby includes only 5,000 image transformations per month; with 592 photos and several
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

| Decision                                                   | Why                                                                                                                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AVIF + WebP** via `<picture>`                            | Measured on this archive in T3, AVIF comes out 46–49% smaller than WebP at the same width, and we can afford it because it is generated once at import. |
| `srcset` + `sizes` at three widths                         | A 360 px phone never downloads a 1200 px image.                                                                                                         |
| `width`/`height` and `aspect-ratio` from stored dimensions | **Zero layout shift.** Scrolling a gallery on a phone, that is the difference between usable and infuriating.                                           |
| `loading="lazy"` except the first row                      | Do not fetch 20 thumbnails to show 4.                                                                                                                   |

**Galleries without JavaScript.** Two columns on a phone, with per-photo `aspect-ratio` resolved
in pure CSS. No client-side masonry — the packing is CSS multi-column, so it is the browser's, not
a script's; see _Grid_. And **pagination with real URLs** instead of
infinite scroll, which breaks the back button, accumulates memory, and cannot be shared or indexed.

T6 built those URLs as paths — `/categoria/campo/2`, with page one at `/categoria/campo` — rather
than the `?p=2` this document first sketched. A page that reads `searchParams` cannot be
prerendered, and prerendering everything is the decision that keeps Neon out of the request path.
Twenty-four photos to a page comes to 33 static pages for the whole archive.

**The photo detail page, which is the main screen.** Full-width image, caption immediately below
in legible type, credit visible rather than buried. Pinch zoom **is not disabled**: someone will
want to look closely at a face, and blocking that is an accessibility failure. Previous and next
as real server-rendered links.

**The original/restored switch is two A/B buttons, not a drag slider.** A drag slider on a
touchscreen fights with page scrolling.

**Search runs on the server**, with results rendered and cached per query at the CDN. That avoids
shipping a ~90 KB search index paid for with mobile data, and the result gets a shareable URL. It
is also the only place the database is touched per visit, so if Neon's limit ever bites, this is
where to look.

T8 built it, and it is literally the one exception: 631 routes and `/buscar` is the only dynamic
one, because reading `searchParams` is a request-time API in Next 16. The page adds **no JavaScript
of its own** — the same seven chunks as a gallery — and the filters are a GET form of native
`<select>`s, so the whole screen works with script disabled. T8 put two caches under it:
`unstable_cache` per query, and an hour of `s-maxage` set for `/buscar` in `next.config.ts` —
needed because Next puts `private, no-cache, no-store` on a dynamically rendered page, and measured
to win over it.

**T10 took the second one out**, and the reason is worth keeping. `revalidateTag` cannot reach a CDN
entry for a route that is not ISR, which T8 recorded as an hour's delay for a corrected caption.
Once the panel could take a photograph down, the same hour became something else: a withdrawn
photograph's caption and credit — the research text that names living people — went on being served
from cached search results long after its own page answered 410, on the one public route the proxy
does not cover. Neon is protected anyway, and by the layer that can be invalidated: the query behind
the page is an `unstable_cache` tagged `GALLERY_TAG`, so two people searching the same words still
reach the database once and a takedown drops that entry with every other. What the CDN entry was
buying was a function invocation.

The filters offer only what the search reaches — each one computed without its own value and with
the other two applied. A dropdown that lists a decade holding nothing is a dead end, and on an
archive where 460 of the 592 photographs carry no year at all, most decades are empty most of the
time. Each option states how many photographs it holds, which is what lets a reader decide before
spending a request — and the request is why the filters do not apply on change: a navigation costs
a median 677 ms at 562 ms RTT, so the button gathers three choices into one of them.

**Typography**: a single display family for headings, subset to Latin, with `font-display: swap`;
body text on the system stack.

**The panel works on a phone too**, but with priorities: bulk loading happens from Drive on a
computer, and what must work well on a phone is fixing a caption and flagging a photo as
sensitive.

## Visual direction: Álbum

Three directions were built on the same nine photographs from the archive and the same two screens,
and this is the one that was chosen. The other two are worth naming, because the choice was between
readings of what the archive _is_, not between palettes: **Ficha** treated it as a research
catalogue, metadata as prominent as the image; **Pueblo** treated it as the town's own noticeboard,
heavy black type and a civic accent. **Álbum** treats it as what it materially was — prints lent by
neighbours, kept in albums and boxes.

Which is why the ground is dark. It is not a fashion: mount board is where these copies actually
lived, and a scanned sepia print lifts off a dark ground in a way it never does off white. The cost
is real and worth writing down — a dark gallery is more solemn than the subject sometimes is, and it
draws more power on an OLED phone.

### Tokens

| Token          | Value     | Contrast on ground | Used for                               |
| -------------- | --------- | ------------------ | -------------------------------------- |
| `--ground`     | `#1B1917` | —                  | the page                               |
| `--surface`    | `#23201D` | —                  | cards, the veil over a sensitive photo |
| `--text`       | `#EDE6DA` | 14.1:1             | captions, headings                     |
| `--text-muted` | `#A2988A` | 6.2:1              | notes, metadata labels, pagination     |
| `--rule`       | `#3B3630` | —                  | hairlines between metadata rows        |
| `--accent`     | `#C9954E` | 6.6:1              | the credit, links, the current page    |
| `--accent-dim` | `#8F6A38` | —                  | hover and pressed                      |
| `--focus`      | `#E0B87A` | 9.4:1              | keyboard focus ring                    |
| `--on-accent`  | `#1B1917` | —                  | text on an accent fill                 |

Every text token clears WCAG AA at body size. A third, fainter grey was drawn and then cut: at
`#7A7166` it measured 3.7:1, which fails, and lightening it far enough to pass made it
indistinguishable from `--text-muted`. Two tiers and the accent carry everything.

### Typography

**Alegreya** — regular, medium and italic, Latin subset, `font-display: swap` — for captions, notes
and section titles. It was drawn by Huerta Tipográfica in Argentina for long-form Spanish, so the
accents and the ñ were designed in rather than bolted on, and this archive is mostly Italian and
Spanish surnames.

Everything that is not archive text — labels, metadata, pagination, buttons — sits on the **system
stack**. The proposal paired Alegreya with Alegreya Sans, and production drops the second family:
the rule in _Mobile first_ is one webfont, the bytes are paid on rural mobile data, and what makes
this direction is serif captions on a dark ground, not the label font. Nobody will miss it.

Scale, as built, with named roles rather than improvised sizes — the proposal's numbers were
replaced during T6 because a scale with no names is how everything ends up between 11 and 30 px:

| role               | phone       | from 640 px | family          | notes                                |
| ------------------ | ----------- | ----------- | --------------- | ------------------------------------ |
| `.t-headline`      | 500 34/1.08 | 64/1.02     | Alegreya        | tracking −0.015em, max 24ch          |
| `.t-section`       | 500 34/1.08 | 56/1.03     | Alegreya        | max 20ch                             |
| `.t-intro`         | 400 17/1.5  | 22/1.45     | Alegreya        | max 78ch                             |
| `.t-caption-grid`  | 400 15/1.35 | 17/1.4      | Alegreya        | max 34ch, the heritage               |
| `.t-caption-photo` | 400 19/1.5  | 23/1.45     | Alegreya        | max 56ch, the same on its own screen |
| `.t-note`          | 400 16/1.6  | 17          | Alegreya italic | max 62ch, muted, the source note     |
| `.t-credit`        | 400 16/1.4  | 17          | system          | accent, max 48ch                     |
| `.t-label`         | 400 11/1    | —           | system mono     | uppercase, 0.1em, muted              |
| `.t-meta`          | 400 14/1.4  | —           | system mono     | tabular figures, muted               |
| `.t-thanks`        | 500 24/1.16 | 34/1.14     | Alegreya        | footer, max 24ch                     |
| `.t-fineprint`     | 400 14/1.55 | —           | system          | footer, max 58ch, muted              |
| `.t-signature`     | 500 20/1.28 | 22/1.25     | Alegreya        | footer, the authors' names           |

The identifiers are English because _Language conventions_ covers identifiers, not only comments:
the first pass shipped them as `.t-titular`, `.t-entradilla`, `.t-epigrafe-grilla` and friends, and
T6 renamed them. `.t-caption-grid` is deliberately a family name, so the photo page's own caption
role lands as `.t-caption-photo` in T7 — which it did, and it brought `.t-note` with it.

That note is the only italic on the site, and it is why Alegreya is loaded twice: a second
`next/font` instance declared `preload: false`, so the italic file is fetched on the twelve pages
that carry a note and on no other. Both instances resolve to the same family name, so what the
second one actually buys is the italic face registered without a preload link.

### Grid

Two columns below 640 px, three to 1000, four above. Gap of 16 px on a phone, 24 px above it, and a
32/44 px margin down the column — this direction spends its budget on air between photographs. Every
cell reserves its exact height from `master_width`/`master_height`, so nothing moves as images
arrive.

**It is CSS multi-column, and the packed wall it replaced is worth recording.** T6 first built the
design proposal's packed wall: twelve columns, `grid-auto-flow: dense`, 4 px row tracks, each
photograph spanning three, four or five columns by its real proportion, and each cell's height
reserved in rows computed on the server. That needs the caption's height, which is not knowable
before layout, so the server estimated it from the character count — and an estimate there is forced
to err long, because coming up short lets a cell ride over its neighbour. Measured on Espacios: 13%
of the wall's height left empty, 1,479 px across 24 photographs, **every single cell** over-reserving
between 33 and 104 px. No calibration of the constant fixes that; the sign of the error is
structural.

Columns have no rows to reserve, so each one packs tight and the different heights sit against each
other, which is the behaviour the Europeana reference has. Same page, same 24 photographs: the wall
went from 4,324 px to 2,491 px, and the vertical gaps became exactly the margin, uniform. It deleted
`src/lib/wall.ts` whole, along with the guessed constants inside it.

Two costs, both real. **The reading order turns column-wise**: the order the authors gave runs down
the first column and then down the second, not left to right. And the variable cell widths are gone —
a panorama no longer takes more room than a portrait. Recovering both at once means measuring text,
which means JavaScript, or `grid-template-rows: masonry`, which is behind a flag in one browser.

A photograph is set like a mounted print: a `1px` light edge at `rgba(237, 230, 218, 0.16)` over a
soft drop shadow, never a border-radius. The caption sits directly below, the credit under it in
sepia italic, which reads as a signature at the foot of a print rather than as a data field.

A sensitive photograph is blurred at `9px` with a `1.12` scale so the blur reaches the edges, under
a veil at `rgba(27, 25, 23, 0.84)` — opaque enough that the label stays legible over a bright
photograph — carrying the warning and a "Ver la fotografía" link in accent. Blurred, never hidden.

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
  year_from         -- filters     search_vector ┘  tsvector, filled by a trigger
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
  restored_drive_file_id / restored_master_key
  restored_web_key / restored_thumb_key
  restored_method / restored_at

photo_category                   app_user
  photo_id ─────┐ pk               id
  category_id ──┘                  email unique
  position                         name

site_text                        -- every word the site says about itself
  key ──────────┐ pk               home_title, home_intro, rights_notice, thanks,
  locale ───────┘                  authors, contact, town_title, town_intro,
  value                            map_embed_url + the three network addresses
```

Details that matter:

- **`master_source` + `drive_file_id`**: today the best available master is the copy rescued from
  Sites. When the real scan is uploaded, `master_source` becomes `'drive'`, derivatives are
  regenerated, and **not a single metadata field is touched**.
- **`restored_master_key`, added in T10**, and it is principle 1 applied to the second image.
  The schema shipped with `restored_drive_file_id` and the two derivative keys but no master for
  the restoration, and a takedown deletes derivatives -- so unpublishing a photograph whose
  restoration had been uploaded by hand would have destroyed it, with nothing to regenerate from
  unless the file happened to still be in Drive. A takedown must not cost anybody their work. One
  nullable column, and the restoration is now stored exactly like the photograph: master kept,
  derivatives regenerable.
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
- **`site_text` is where every word of the site lives**, keyed, one row per locale. T6 seeded twelve
  keys: `home_title`, `home_intro`, `rights_notice`, `thanks`, `authors`, `contact`, `town_title`,
  `town_intro`, `map_embed_url`, and the three network addresses. The last six arrived while
  building the home page and the footer, which is what closes F6 — the home copy T1 rescued is in
  the database now, not only in `archive.json`. The map's coordinates and the social URLs are in
  there for the same reason as the prose: moving the pin or adding a fourth network must not need a
  deploy. The only words in code are labels: "El archivo hasta hoy", "A cargo del archivo",
  "Contacto", "Redes", "Secciones", "Buscar", "Todas las secciones".
- **A URL out of the database is a trust boundary.** `site_text` becomes editable from the panel in
  T11, and its values reach an `href` and an `<iframe src>`, so `src/lib/url.ts` guards them: the
  map embed against an exact hostname allowlist, the network links against the scheme only, since
  which networks the archive is on is theirs to change. Exact hostname match and never `endsWith`,
  because `maps.google.com.evil.com` ends with the right string. `npm run url:smoke` covers the
  cases that fool a naive parser, userinfo and `javascript:` among them.
  Highlights have no order of their own: they follow category order, and a `featured_position`
  gets added when that default becomes annoying.
- **Search**: `tsvector` with Postgres dictionaries (`spanish`, `english`, `french`, `italian`)
  plus the `unaccent` extension, so that "Tesolin" finds "Tesolín". T2 built this as four text
  search configurations (`es_unaccent` and friends), because the built-in dictionaries cannot be
  altered, and **fills `search_vector` from a trigger rather than from application code**: a
  generated column cannot pick its configuration from the row's `locale`, and a trigger means the
  seed, the panel and the translation editor cannot forget.
- **What is searched is the caption plus two things that are not text of the photograph**: its
  credit and the names of its sections. T8 found that the column alone answers neither acceptance
  criterion on this archive — 61 of the 62 Tesolín photographs carry the surname only in `credit`,
  and "Educación" is a section name that appears in no caption. Both are **composed into the
  document at query time and not folded into `search_vector`**, because neither belongs to the
  translation row: a credit lives on `photo` and a section on `photo_category`, so a trigger on
  `photo_translation` cannot see either change and the column would go quietly stale the first time
  the panel edits a credit. The cost is that the GIN index does not serve the query — 5.5 ms over
  592 rows, and the way out, if the archive ever outgrows it, is in a `ponytail:` comment in
  `src/db/queries/search.ts`.

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

**How the 410 is produced, as built in T10.** No page in Next 16 can choose its status code:
`notFound()` gives 404, `forbidden()` and `unauthorized()` give 403 and 401, and there is nothing
else -- so the two ways out F29 recorded turned out not to exist, since a `route.ts` also cannot sit
at the same path as a `page.tsx`. The one place in the framework that can put an arbitrary status on
a URL is `proxy.ts`, so `src/proxy.ts` matches `/foto/:slug` and answers 410 for a slug that is on
the takedown list. It reads that list from `/api/gone` rather than from the database, because a
lookup per request would put Neon back in the request path -- the one thing the pre-rendered design
exists to avoid -- and it memoizes the answer for two seconds. The proxy carries no authorization:
T9's decision that a proxy is not an auth boundary still stands.

**What the proxy costs, and what the memo actually bounds.** This runs on every `/foto/:slug`
request, prefetches included, so it was measured on the production build rather than reasoned about.
The list is fetched **once per instance**, not once per request -- the first version fetched it 24
times for 24 concurrent requests, which is precisely a gallery prefetching its page of photographs,
and the in-flight promise is now shared. What remains is **180-191 ms** of TTFB on a cold instance
against **76 ms** for a gallery, which carries no proxy, and **9 ms** warm; a stale memo refreshes
behind the answer instead of blocking it, at 25 ms. Blocking that first request is deliberate:
passing through while the list loads would take the fetch off the critical path entirely, and on an
archive this quiet most requests arrive at a cold instance, so the answer would almost always be the
empty list and the 410 would never fire.

The memo is what the lag is made of, and the lag is **not** merely 404 where 410 belongs: until it
catches up, the photograph's page is still the pre-rendered one, **200 with the caption on it**. The
image is dead from the moment the panel answers; the caption is the part that names living people,
so two seconds is the ceiling rather than ten. Measured end to end: 1.9 s of the stale page, then
404, then 410 at 2.7 s. The opposite direction is closed rather than bounded -- a photograph that has
just been republished must never be declared permanently gone, so the proxy re-reads the list before
it answers 410, a cost charged only to requests for photographs that are already down.

**Revalidation after a write takes two profiles, and the difference is not cosmetic.** The photo
pages are pre-rendered with `dynamicParams = false`, which means the pre-rendered copy is the only
copy: expiring it with `revalidateTag(tag, { expire: 0 })` leaves nothing to serve and nothing to
regenerate it from, and `next start` then answers **404 for every photograph and every gallery**
with `NoFallbackError` until the process restarts. Measured, on the way to shipping T10. So
`GALLERY_TAG` is revalidated with `'max'`, which serves the old page while the new one renders
behind it. The takedown list is the opposite case -- stale is exactly what it cannot be -- so it
carries a tag of its own, `TAKEDOWN_TAG`, revalidated with `{ expire: 0 }`. It is read by a route
handler, which always regenerates on demand, so expiring it risks nothing.

**How long a change takes to show, end to end.** Three caches sit between a save and a reader, and
only the first two were in this document. Measured after editing a caption from the panel: the
server answers with the new text on the **third request, about two seconds later** -- the first is
served stale and starts the revalidation, which is what `'max'` is. Then there is a third cache that
is not ours: Next keeps a statically generated page in the **client** for five minutes, so a reader
already browsing, or an editor who clicks through from the panel, can be shown the old page long
after the server has the new one. That is why the panel's links to the public site are plain
anchors: a document load has no client cache, and those links exist precisely to check what was just
changed. Turning the window down globally (`experimental.staleTimes`) was rejected -- it would cost
every reader the instant back-and-forth the galleries were built for, to fix a case only the two
editors hit.

**The two gallery routes are `dynamicParams = true`, and `/foto/[slug]` is not.** T11 is where the
difference appeared, and it is not a preference: the panel can create a section now, and a slug that
did not exist when the site was built has no entry in `generateStaticParams` and therefore no route
at all -- the panel would report success and `/categoria/<slug>` would answer 404 until somebody
deployed. `/foto/[slug]` avoids that by listing every photograph, published or not, because the set
of slugs is fixed by the archive; there is no equivalent list to widen for a section that does not
exist yet, so `/categoria/[slug]` and `/categoria/[slug]/[page]` render an unknown slug on demand
instead. It costs nothing the prerendered path was buying -- `listSections()` is cached and tagged,
so Neon stays out of the request path -- and it makes revalidation safer rather than riskier, since
a route that can regenerate cannot be left with nothing to serve. An unknown section still answers
404; the price is that a made-up slug now costs a function invocation, which is the same exposure
`/buscar` already has and which F31's rate limiting covers.

**Two consequences of `dynamicParams = false` that anyone touching `/foto/[slug]` needs.** They are
the same fact seen twice: the pre-rendered copy is the only copy, and nothing can make another one
until the next build.

- **`revalidatePath('/foto/<slug>')` must not be used.** It evicts that page's only copy, and the
  photograph then answers 404 **until the next deploy** -- the `{ expire: 0 }` failure narrowed to
  one page. Tried in T10 to close the window above, and rejected.
- **`generateStaticParams` lists every photograph, published or not.** It runs at build time and
  never again, so filtering by `published` meant a photograph taken down before a deploy had no
  route afterwards: the panel would publish it, regenerate its derivatives, report success, and the
  page would go on answering 404 until somebody deployed. An unpublished slug costs one build-time
  render that ends in `notFound()`, and buys a path revalidation can fill. Invented slugs still cost
  nothing, because the list never leaves the archive.

Two technical consequences that must be decided before writing code, not after:

- **R2 keys cannot be guessable.** If they were `photos/campo-078/web.avif`, anyone could derive
  the rest of the archive and the takedown would be a lie again. They carry a random component per
  photo.
- **The masters sit in the same public bucket, and a takedown does not touch them.** By design the
  master survives, and the design assumed it survives in Drive; today, for all 592, it is the copy
  rescued from Sites and it lives in R2 behind the same public domain as the derivatives. Its key
  carries the same random component and no page has ever linked it, so it is not reachable by
  guessing or by walking the archive -- but it is reachable by anyone who wrote the URL down. Closing
  that means keeping `masters/` off the public domain, which is bucket configuration rather than
  code, and it belongs with F16 in T14.
- **Google keeps cached copies.** Unpublishing does not remove it from the index immediately; that
  needs the Search Console removal tool. It is procedure, not code, and it should be written down
  so the brothers can do it without the maintainer.

The `/sobre` page carries the contact address (fototecalp@gmail.com) with an explicit line on how
to request a correction or a takedown.

**A result set is not a page of the archive.** Everything above is about the photographs, which are
indexed. `/buscar` itself carries `noindex, follow`: an open search box is unbounded URL space, and
what should be found is the photograph, not the query that reached it.

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
- **Secret detection, two layers**: GitHub secret scanning with **push protection** is free on
  public repositories and enabled by default, so a detected secret is refused server-side at push
  time — a stronger guarantee than any local check, because it also covers pushes from a machine
  with no hooks installed. On top of that, the local `gitleaks` pre-commit hook wired through
  git's native `core.hooksPath` catches things before they even become a commit.
- **If a secret leaks, rotate it — do not rewrite history.** Assume it has already been copied.
  This matters more than usual here: the repository is **public**, so anything committed is
  readable by anyone the moment it is pushed. Nothing in the repo is sensitive today — the authors'
  names and contact address are already published on the current site — but the margin for error
  with credentials is zero.

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

| Change                                            | How                                                                                                         |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Fix a caption, a year, a credit                   | Panel → the photo → save. Revalidates its detail page and the galleries it appears in.                      |
| Flag a photo as sensitive                         | Panel → the sensitive checkbox.                                                                             |
| Add, rename, hide or reorder a category           | Panel → categories. The public route appears or disappears on its own.                                      |
| Move a photo between categories, or put it in two | Panel → the photo. The relation is N:N.                                                                     |
| Reorder photos within a category                  | Panel → drag (`photo_category.position`).                                                                   |
| Organize the home page                            | Panel → Home: section order and visibility, each section's cover photo, and which photos are featured.      |
| Change a section's intro text                     | Panel → category → intro, per language.                                                                     |
| Change any of the site's own words                | Panel → textos del sitio: the home copy, the rights notice, the thanks, the contact, the map, the networks. |
| Add new photos                                    | Panel → import from Drive.                                                                                  |
| Attach an AI restoration                          | Panel → the photo → restored version.                                                                       |
| Translate to English, French or Italian           | Panel → translations, which also lists what is missing.                                                     |

These require touching code, and that is as it should be: visual design, viewer behavior, the
structure of the detail page, and adding a new language to the list.

---

## Rescuing the current archive

**There is no API for the new Google Sites**: the Sites API only reaches Classic Sites and is
deprecated. **And there is no Takeout route either** — this document used to assume one, and T1
found it does not exist: the product list at takeout.google.com, on the archive's own account,
offers no Sites entry at all (checked 2026-08-28, full list read item by item). Whatever the Sites
API and Takeout used to do for Classic Sites, neither reaches this site.

That leaves **the scraper as the only route**, which turned out to be the good news: the live HTML
is perfectly regular — image → caption → "Cortesía: X" — and it carries the part that took human
work. The image bytes it downloads at `=s0` are what Sites has; the CDN 403s on stale tokens, so
each section is downloaded right after its page is read.

What the Takeout attempt did deliver was the Drive folder `Fototeca`: the brothers' working
material, 649 images organised by lending family plus their caption notes as `.txt`. It settles the
resolution question from the other side and is recorded in [TAKEOUT.md](./TAKEOUT.md), but it is
not a second copy of the archive: 497 of its images match a published photo's exact pixel
dimensions and only 4 match its bytes.

Counts, as verified by T1 against the live site: Espacios 70, Sociales 104, Campo 79, Trabajo 55,
Deporte 53, Familias 46, Educación 43, Eucaliptus 43, Religión 41, Inundación '78 31,
Casamientos 27 — **592** in total.

> The earlier figures in this document were every one of them two higher, and the 617 total
> twenty-four higher, because they counted `<img>` tags: the theme's logo appears twice on each of
> the twelve pages. The home page adds no photographs of its own, only the three social-media
> icons, so it is read for its text and contributes nothing to the count.

**73 of the 592 have no caption on the live site**, only a credit. That is the source's own state,
not something lost in transit: their container in the page holds a single "Cortesía" paragraph.
The Drive folder holds hand-written notes (`Explicacion.txt`, `fotos.txt`) that may cover some of
them, which is a job for the panel once T10 exists, not for the extractor.

`tools/extract-sites.py` is that scraper, in English, with the stale-token handling. It replaced
`tools/extraer_sites.py`, which was never executed.

---

## Repository layout

```
fototeca-la-pelada/
├── docs/
│   ├── ARCHITECTURE.md            # this document
│   ├── TASKS.md                   # the task board
│   └── TAKEOUT.md                 # the by-hand half of the archive rescue
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
│   ├── db/{schema.ts,index.ts,queries/}
│   ├── lib/{auth.ts,drive.ts,images.ts,r2.ts}
│   ├── components/
│   └── i18n/messages/{es,en,fr,it}.json
├── drizzle/                       # migrations
├── tools/
│   ├── extract-sites.py           # archive rescue
│   └── seed.ts                    # archive.json → Postgres + R2
└── archive/                       # raw rescue: permanent backup, never deleted
    ├── archive.json               # the metadata: versioned, it is the research work
    └── originals/                 # the image files: gitignored, ~105 MB
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

Storage, counted in R2 after T4 seeded the archive: **242 MB of the 10 GB**, in 3,342 objects —
592 masters at 105 MB, and 2,750 derivatives at 137 MB, an average of 4.6 renditions per photo
rather than six. Two rules pull in opposite directions and both are deliberate: nothing is
upscaled, which is why a 300 px master yields one width instead of three, and a master that sits
between two steps earns a rendition at its own width, which is what keeps a 920 px scan from being
served at 480. Real scans, when they exist, go to Drive, where 5 TB covers tens of thousands.

---

## Risks

| Risk                                                             | Mitigation                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Vercel Hobby is non-commercial use only**                      | The project is non-profit, so it complies. If it is ever monetized, it must move to Pro.                                                                                                                                                   |
| **Neon's free tier suspends the database past 100 CU-hours**     | The public site is pre-rendered: the database is touched on publish, not per visit. Search is the only point to watch.                                                                                                                     |
| **Photos are 300–2340 px and that already is what was uploaded** | The improvement is not in Google but in the source scans. `master_source` + `drive_file_id` allow replacing them without touching a single metadata field.                                                                                 |
| **Google's CDN rate-limits**                                     | Not a download quota: 592 downloads in a row never tripped it, while a token from a page left idle answered 403 at t+61s. The extractor downloads each section right after reading its page, and a 403 re-reads the page for fresh tokens. |
| **Publishing stops being instantaneous**                         | Revalidation is targeted and takes seconds, not a full rebuild.                                                                                                                                                                            |
| **Old Sites links will break**                                   | Sites cannot redirect. Section slugs are preserved and a notice is left on the old site.                                                                                                                                                   |
| **Translations are human work**                                  | Partial translation is supported by design: fallback to Spanish, and the panel shows what is missing.                                                                                                                                      |
| **Photo rights**                                                 | The current site states the photos were digitized with their owners' permission. That notice and the per-photo credit are preserved as a requirement, not decoration.                                                                      |

---

## Verification

- **T1**: per-category counts against the table above; records checked by hand against the live
  site, including the last photo of a section and one of the uncaptioned ones; no caption that
  exists on the site left behind.
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

- ~~**Visual identity**~~: settled in T5. See _Visual direction: Álbum_ above.
- **Where the Sites site sits in Drive**: dropped as a question. It only mattered for the Takeout
  route, and there is no Takeout route — the export list has no Sites product. The scraper needs
  nothing but the public URL.
- **People as first-class entities**: dropped. Search covers the surname case, and captions mix
  people with places.
