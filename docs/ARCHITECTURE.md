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
outside the localization system, and since T13 that separation is physical rather than a
convention: `[locale]` sits **above** the public root layout, so the panel needs a root layout of
its own and there is no shared parent that could carry a translator. `src/components/document.tsx`
is the `<html>`/`<body>`/fonts half the two of them share.

Public routes stay in Spanish (`/categoria`, `/foto`, `/buscar`) because they are user-facing
content for a Spanish-language audience and carry SEO weight — and they stay Spanish in **all four
languages**: `/en/foto/espacios-001`, never `/en/photo/…`. The query parameters go with them
(`?seccion=`, `?credito=`, `?decada=`), and so do the two fragment identifiers on the photo page
(`#original`, `#restaurada`). Anything in an address is something somebody may already have shared.
Admin routes are in English because they are internal.

### Spanish carries no prefix

**`as-needed`**, in next-intl's terms: `/foto/espacios-001` goes on being _the_ Spanish URL and
`/en/foto/espacios-001` is added beside it. `always` was rejected, and the reason is the archive's
own — the whole point of this site over Google Sites is a per-photo permalink that can be shared,
and the link that will actually travel through the town's WhatsApp is the short one. It also spares
every reader a redirect hop on a normal visit. `/es/foto/espacios-001` answers 307 to the
unprefixed form, so one page never has two addresses.

**Nothing detects the reader's language, and nothing is remembered.** next-intl's
`localeDetection` and `localeCookie` are both off, which is a decision and not a default. With
either on, `accept-language` or a previous visit could redirect a reader away from the address they
were handed: the short Spanish link shared in the town would land an Italian-speaking descendant on
`/it/foto/…`, and one address would serve two different pages to two people. The URL is the only
thing that decides the language, the picker in the header is the only thing that changes it. Two
things fall out for free — every public address stays cacheable at the CDN with no `Vary`, and the
public site sets no cookie at all.

**The picker is four links, and the redirect is what makes them keep the page.** A layout cannot
know the path it is wrapping — the only way to read it on the server is a request header, and
reading one would make all 592 pre-rendered photo pages dynamic, for a control in a dropdown. So
each button is an `<a href="/idioma/en">`, and `proxy.ts` turns that into a 307 to the same page in
the chosen language, from the `Referer`. No client state, works with JavaScript off, and answers
`no-store` because the address is the same for every reader while the answer is not. With no
`Referer` — a pasted link, a privacy extension — it lands on that language's home page, which is
the whole of the degradation.

**A `Referer` is attacker-controllable input, so the answer is checked rather than the input
trusted**, and the first version of this got it wrong. Rejecting another origin is the obvious half
and it is not enough: a referer that passes the same-origin test can still carry a pathname
beginning with `//` — `https://site//evil.com`, which is also what a browser makes of
`/\/evil.com` — and `new URL('//evil.com', origin)` resolves that as a **new origin**, so
`/idioma/es` answered `Location: http://evil.com/`. Found in review, measured against the running
build, and it fired on the **Spanish button only**, because that is the branch where `localeHref`
returns the path untouched. Which is the point worth keeping: an asymmetry between one locale and
the other three is exactly the kind of thing a reading passes over.

The fix asserts the **built URL's** origin instead of pattern-matching the path, so `//`, `/\`,
userinfo and whatever else `URL` chooses to interpret all fail the same check and all get the same
answer as a missing `Referer`. It lives in `switchHref` in `src/i18n/config.ts` rather than in the
proxy, so that it is a pure function with a test: `npm run i18n:smoke` runs the six hostile shapes
against all four languages, and those assertions fail against the code that shipped into the build
before the review.

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
| i18n           | **next-intl**, Spanish unprefixed        | Public site only, `/`, `/en`, `/fr`, `/it`. Translations live in the database and fall back to Spanish in SQL; the site's own labels live in `src/i18n/messages/`.                    |
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

Re-measured on the way through T13, because the number is the argument: a gallery now loads
**173 KB gzipped over eight chunks**, the growth belonging to T7-T12 and the header redesign rather
than to any one decision. T13 itself adds **zero** — the same eight chunks and the same 173 KB, byte
for byte, on `main` and on the branch and in all four languages. Localization is entirely
server-side: `getTranslations` is called with an explicit locale in Server Components, the three
client components take their strings as props, and no message file and no `use-intl` runtime reaches
the browser. Which was not free to arrange: left to resolve the locale itself, next-intl reads a
request header, and reading one opts the component into dynamic rendering — the whole pre-rendered
archive rendered per request, for a label.

### Why Drive stores but does not serve

Serving photos straight from Drive is not viable, for three independent reasons:

1. **It is blocked.** `drive.google.com/uc?export=view&id=...` has returned 403 since January
   2024: Google deliberately cut hotlinking to external domains. The workaround that circulates
   (`/thumbnail?id=...&sz=w1000`) is rate-limited and fails precisely when a page holds many
   images — which is exactly what a gallery is.
2. **Per-file download quota.** When a photo becomes popular, Drive answers "too many users have
   viewed or downloaded this file recently". On a public site that is an outage.
3. **The Drive API terms forbid it**: using Drive as a CDN replacement is not permitted.

| Where                          | What it holds                                                                                                                                                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Drive** — 5 TB, already paid | Preservation masters: scans at maximum quality. Never served to the public. 5 TB fits tens of thousands.                                                                                                                         |
| **R2** — 10 GB, free           | The derivatives the site consumes, plus the rescued masters until real scans exist: 242 MB for the current 592, measured after T4 seeded them. **An imported master never lands here**: 600 high-resolution scans would not fit. |

### The bridge: importing from Drive in the admin panel

The same Google OAuth they use to sign in could also read Drive (`drive.readonly` scope), but T12
went the other way: a **service account** with the folder shared to its address. It does not expire,
it is read-only, and it sees exactly the one folder that was shared with it. The key travels as
base64 in an environment variable and is decoded in memory; the JSON never touches the repository or
the disk. It needs no `googleapis` dependency either — two REST endpoints and an RS256 signature,
which Node signs in the standard library.

1. The brothers drop scans into a Drive folder — the gesture they already know.
2. In the panel they pick the folder **and the section**; the server lists its files.
3. For each photo: download the master, generate derivatives with `sharp`, upload them to R2.
4. The database keeps the master's `drive_file_id`, its hash and its real dimensions.

The master is never lost or duplicated, and it **never reaches R2**. Drive API egress quota is not a
concern because it is only used for occasional imports, never to serve traffic.

**One photograph per request, and that is a design constraint rather than an implementation
detail.** A master download plus six encodes plus six uploads is seconds per photograph, so a folder
in a single request does not finish inside the function's duration limit — 60 s on Vercel Hobby,
declared as `maxDuration` on the import page, which the route segment config extends to the server
actions the page invokes. So the action imports the _first pending_ file and returns, and the screen
decides whether to ask for another. Two things fall out of it for free. It is **resumable**: what is
pending is derived from the database on every render, so closing the tab or timing out on photograph
forty costs the forty-first, not the forty before it. And it needs **no queue and no job system** —
there is nothing to persist, because Drive holds the work list and `drive_file_id` holds the
progress. The loop itself is a hidden submit button that presses itself once per render; with script
off the two real buttons are still there and each click brings one photograph.

**Re-importing a folder is a no-op, and the guarantee is Postgres's.** `drive_file_id` carries a
**partial unique index** (`where drive_file_id is not null`), added in `drizzle/0005`. The import
does check the set of already-imported ids before it writes, but only so the screen can say which
photograph a file became: a read before a write is a race, not a promise, and two administrators
pressing the button in the same second is exactly the case an application-level check cannot cover.
Partial because the 592 rescued from Sites all carry null there — Postgres treats nulls as distinct
in a unique index anyway, so the predicate buys documentation and 592 fewer index entries rather
than different behaviour.

**A Drive filename is not a permalink.** They carry spaces, accents and repeats, so an imported
photograph gets the archive's own convention instead: the chosen section's slug plus the next free
number, `espacios-071`. All 592 existing slugs are `<section>-NNN` with no exceptions, and the next
number is counted over `photo.slug` rather than over the section's membership, because a photograph
keeps its slug when it moves between sections and reusing a number freed that way would collide with
a permalink somebody already shared.

**A file in a shared folder is untrusted input, its declared `mimeType` included.** The real type is
read from the bytes with `sharp` and never from the extension or from what Drive reported; anything
sharp cannot decode is refused; and the download stops at 40 MB **as the bytes arrive**, because
buffering a whole file before objecting to its size is the failure it was supposed to prevent. The
mimeType filter on the listing is a convenience — it keeps the brothers' `.txt` notes out of the
count — and never a check.

A photograph arrives **published**, at the end of its section, with no caption and no credit, which
is the state 73 of the original 592 are in and what the "Sin epígrafe" filter exists for. It was
published because the alternative broke the storage invariant of the time -- an unpublished
photograph had no derivatives, since a takedown deleted them. That invariant is gone: hiding deletes
nothing, so arriving hidden would now be a coherent choice. It still arrives published, because 592
of 592 are and the import is how the brothers see that a folder worked. **Despublicar** is one click
if it should wait.

### Cross-cutting decision: the public site is pre-rendered

Public pages are statically generated with ISR and revalidated **when the panel publishes a
change** (`revalidateTag`), not on every visit. The database is therefore barely touched in
production, which removes the risk from Neon's free tier (100 CU-hours/month, which **suspends the
database when exceeded**). It also means the site responds from CDN, which matters on slow
connections.

**Four languages do not multiply it by four, and T13 chose where they do.** 592 photographs in four
languages is 2,368 pages, and 1,776 of them would be a Spanish caption rendered under an English
`<html lang>` — because no translation exists yet, and because even a fully translated archive is
translated a section at a time. So the split is: the home page and all 30 gallery pages pre-render
in every language (they are the entry points, and cheap), and `/foto/[slug]` pre-renders **every
photograph in Spanish and the first photograph of each section in the other three**. Counted off
the build's own manifest: **756 routes** — 625 photographs (592 Spanish plus eleven in each of the
other three), 120 galleries, four home pages and seven framework and icon routes. The rest render on first visit and become ISR entries under the same
`GALLERY_TAG`, which is what `dynamicParams = true` was already turned on for.

**The eleven per language are a framework constraint, not a hedge, and it was measured.** Returning
`[]` from `generateStaticParams` for the other three locales — which the Next docs describe as
"render these at runtime" — makes Next 16.3.3 discard the static params of that segment _entirely_,
Spanish included: the build went from 592 pre-rendered photo pages to **zero**, silently, while
`generateStaticParams` still returned all 592 for `es`. Verified in both directions by returning
two slugs for every locale instead, which produced the expected eight pages. So every parent locale
has to come back with something, and the something worth having is the head of each gallery.

**Every cache on the public read path carries the locale in its key**, and this is the failure that
would have been hardest to see: an entry keyed `['sections']` serves whichever language happened to
fill it first to all the others, so the bug is intermittent and depends on the order of the first
two requests after a deploy. `unstable_cache` fixes its key parts when it is created, so a locale
arriving as an argument can only reach the key through the closure — which is exactly the case
Next's own documentation says `keyParts` exists for. `perLocale` in `db/queries/gallery.ts` builds
one cached reader per language and is the only way the public queries are cached. Verified by
asking for the English route first from a cold cache and then the Spanish one, and then the same
two in the opposite order: identical answers both ways. The four reads that are **not** per language
are the ones that read no translation — counts, slugs and curatorial order.

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
conveniences (revealing a sensitive image, switching original/restored, instant filtering,
remembering the sensitive-content preference). If it fails, the archive is still readable.

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
Twenty-four photos to a page comes to 30 static pages for the whole archive.

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
  restored_at

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
- **`master_key` and `drive_file_id` are two places, not two states, and T12 is where that stopped
  being theoretical.** A rescued photograph has `master_key` set and `drive_file_id` null; an
  imported one has it exactly the other way round, permanently, because the master stays in Drive.
  Both are legal and a half-migrated row can hold both, with `master_source` naming which one is the
  document. So **nothing reads `master_key` directly**: `readMaster(row)` in `src/lib/derivatives.ts`
  is the one door to a master's bytes, and `hasMaster(row)` is exactly its negation — whatever the
  second calls true, the first can read.

  This was a latent bug rather than a new feature. `setPublished` asked for `!row.masterKey` before
  it would republish and then dereferenced `row.masterKey!` to regenerate, which was true of all 592
  and false of the first photograph ever imported: it could have been unpublished and **never
  published again**, with a perfectly good master sitting in Drive. The fix is not to copy masters
  into R2 — that breaks the storage split and does not fit in 10 GB — but to make the read
  polymorphic, once, where every caller passes. `npm run drive:smoke` asserts both shapes.

- **`restored_master_key`, added in T10**, and it is principle 1 applied to the second image.
  The schema shipped with `restored_drive_file_id` and the two derivative keys but no master for
  the restoration, and unpublishing then deleted derivatives -- so hiding a photograph whose
  restoration had been uploaded by hand would have destroyed it, with nothing to regenerate from
  unless the file happened to still be in Drive. Hiding must not cost anybody their work. One
  nullable column, and the restoration is now stored exactly like the photograph: master kept,
  derivatives regenerable. The column outlived the danger that motivated it -- hiding deletes
  nothing now -- and it is still what makes the restoration a first-class image rather than a
  cache of one.
- **The fallback to Spanish is in the SQL, not in TypeScript.** Every public read joins the
  asked-for translation _and_ the Spanish one — two aliases of the same table, both lookups on the
  primary key `(photo_id, locale)` — and coalesces the fields. One round trip serves any language,
  there is no N+1, and the rule is readable where the data is read rather than hidden in a helper.
  `coalesce(nullif(asked.caption, ''), source.caption)`, and the `nullif` is not decoration: a
  translation row can exist with nothing in it — the Drive import creates exactly that — and an
  empty English caption means "not translated yet", not "this photograph has no caption". The same
  shape covers `notes`, and `category_translation.name`/`intro`, where the **Spanish** row is the
  inner join because a section with no Spanish name is not a section the panel could have made.
  `site_text` is the one exception: a dozen rows per language, so both come back in one scan and
  the merge is a spread rather than a self-join.
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
  the database now, not only in `archive.json`. The social URLs are in there for the same reason as
  the prose: adding a fourth network must not need a deploy. **The map is the exception, and it is
  deliberate**: the panel no longer offers `map_embed_url` as a field, so the row is fixed. The home
  page still renders whatever is stored, through the same `mapEmbedUrl` guard, but nothing writes it
  — moving the pin is a database edit now. The only words in code are labels: "El archivo hasta
  hoy", "A cargo del archivo", "Contacto", "Redes", "Secciones", "Buscar", "Todas las secciones",
  and from the header's settings panel "Ajustes", "Idioma" and "Contenido sensible". **Since T13
  none of them is in code either**: every label lives in `src/i18n/messages/{es,en,fr,it}.json`, and
  so do the two strings that are copy rather than labels — the sensitive-content warning and the
  sentence explaining the switch — which is where they belong instead of earning `site_text` keys of
  their own. The split is now clean: the **database** carries what the authors wrote, the **message
  files** carry what the site says as a product, and nothing is inline. **It took the review to make
  that true.** T13 left three Spanish strings in `src/components/photo-image.tsx` — the
  sensitive-content warning and its "Ver la fotografía" link, drawn over every sensitive thumbnail,
  plus the `alt` a captionless photograph falls back to — because the photo page states its warning
  in a card of its own and passes `veil={false}`, so the one screen anybody thought to check was the
  one screen that never drew them. They were Spanish on every non-Spanish gallery card, search
  result, featured strip and section cover. `PhotoImage` is imported by the deck, which is Swiper
  and therefore a client component, so it takes those three as a **required** prop — required so
  that no caller can fall back to Spanish silently again, which is what the type checker then proved
  for all four. Counts that read as prose ("592 fotografías · 11 secciones") are ICU plurals there,
  because "1 sección" and "11 secciones" do not share a suffix in any of the four languages.
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
  seed, the panel and the translation editor cannot forget. **T13 made the query side pick the same
  way**, so a search on `/en` is stemmed by English rules — measured: "tanks" and "streets" both
  reach an English caption that "tanks" in Spanish does not touch.

  **And it falls back, which it has to.** With no translations loaded, an English search over
  English vectors alone would answer nothing at all for the whole archive — and once they arrive it
  would answer nothing for whatever is still untranslated, which is a search box lying about what
  is behind it.

  **The public query therefore does not read `search_vector` at all; it re-tokenizes the text.**
  The obvious version does read it — coalesce the asked locale's stored vector with the Spanish one
  — and it is wrong, and it shipped once. A stored vector was stemmed by whatever configuration
  wrote it: the trigger builds the Spanish row with `es_unaccent`, so it holds `'escuel'`, while
  `/en` asks `websearch_to_tsquery('en_unaccent', 'escuela')` for `'escuela'`. Those never meet.
  Measured against the archive: "escuela" found **25 photographs in Spanish and 0 in English**, on
  the very pages that render those Spanish captions. French and Italian found all 25 — their
  stemmers truncate "escuela" to `escuel` too — which is worse than failing outright, because it
  made a structural defect look like an English one. Caught in review; the fix takes English from 0
  back to 25.

  One `to_tsvector` over the coalesced **text**, in the asked locale's configuration, fixes it by
  construction: what the reader typed and what the archive holds go through the same stemmer. It
  costs nothing the query was not already paying, since no index ever served it, and it buys a
  second thing — the fallback becomes **field-level and identical to the one the page renders**, so
  a result is matched on exactly the text the reader will see. `search_vector` is kept because the
  trigger keeps it true for free and because it is where the ceiling below lands, but nothing
  public reads it.

  `npm run search:smoke` asserts both halves, and **the first version of that check was hollow**:
  it searched "Tesolin" in four languages and passed while the caption path returned nothing,
  because "Tesolin" is a _credit_ — 62 credits and exactly one caption — and the credit half of the
  document is re-tokenized per locale either way. It now asserts a caption-only word as well.

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

### The translation editor, as built in T15

The archive holds **559 translatable pieces per language** — 519 captions, 12 source notes, 11
section names, 10 section intros and the 7 `site_text` keys that are language — over 45,524
characters of Spanish. Three languages is 1,677 translations, so this was never going to be two
people's evening, and the card that said "human work, no new code" was wrong on both counts: there
was no write path for a non-Spanish locale anywhere in the panel (F45), and a translation put in
with `psql` could take a day to appear (F42).

**The decision the editor is arranged around: the machine's proposals live outside the database.**
They are JSON files in the repository, `src/app/admin/translations/proposals/`, written by
`npm run translations:export` and read by the panel. Three things fall out of that, and together
they are worth more than the column the alternative would have needed:

- **No schema change.** A non-empty `photo_translation.caption` is text somebody decided to keep.
  There is no `reviewed_at` to maintain and no migration.
- **`translationProgress` already counted exactly that**, `coalesce(caption,'') <> ''`, so T13's
  screen goes on meaning the right thing without a line of its SQL changing.
- **What the machine said stays in git**, so the difference between the proposal and what is stored
  is readable years from now.

**This section used to claim a fourth thing, and it is no longer true.** It said the public site
_could not_ serve an unreviewed machine translation — not unlikely, impossible, because no path
existed. `tools/translations-load.ts` is that path. It was added at the maintainer's explicit
request, after the alternative was put plainly: 559 pieces per language reviewed one at a time in
the panel, against captions that name living people. The decision was to load everything and
correct what turns up. **Recording it here rather than deleting the old sentence is the point** — a
document that quietly drops a guarantee is worse than one that never made it.

What the panel still guarantees is narrower and worth stating exactly: **no screen in the
application can publish a proposal.** The bulk path is a CLI, it needs the repository and
`DATABASE_URL`, and it never overwrites a target that already holds text — the 28 pieces translated
by hand before it ran were kept, and the run reports how many it left alone. It also cannot
revalidate, which is F42 in a new place: `revalidateTag` needs a request context that a CLI does
not have, so a bulk load is invisible to readers until any single save in the panel fires the tag.
Measured after loading 1,649 translations: `/fr/categoria/campo` still read "Campo" until one
unchanged page was resubmitted in the panel, and then all three languages turned over.

They are **indexed by the source text and not by the photograph**, which is what makes the 118
captions that are duplicated word for word — 519 captions are 401 distinct strings — one job
instead of three, and what makes a proposal stop offering itself the moment somebody corrects the
Spanish it was made from.

**One writer, four callers, and the fourth is the reason for the other three.** `writeTranslations`
in `admin/translations/save.ts` is the only thing that writes a translation, and it is called from
the queue's own action and from `saveDetails`, `saveCategory` and `saveSiteText` — **inside the
form and the transaction each of those already had**. That is not tidiness. The gesture the editor
was built for is: import a photograph, write its Spanish caption, copy it into a translator, paste
three translations back, press Guardar once. A second form below the first would have meant
pressing the lower button and losing the Spanish sitting unsent in the upper one. It also keeps in
one place the fact that the three tables disagree about what "not translated" looks like:
`photo_translation.caption` is nullable, so it is a null; `category_translation.name` and
`site_text.value` are `NOT NULL`, so there it is the absence of the row.

**F42 is closed by construction rather than by remembering**: every one of those four goes through
`outcome()`, the one function in the repository that calls `revalidateTag`, so a translation write
that forgets to revalidate cannot be written. Measured against `next start` in both directions: an
`insert` straight into the database left `/en/foto/espacios-001` serving Spanish through five
requests over five seconds; the same caption saved from the panel was live on the **fourth**
request, about three seconds later. Not instantaneous, and it never was going to be —
`revalidateTag(tag, 'max')` serves the old page while the new one renders behind it, which is the
profile T10 chose deliberately and which _Revalidation after a write takes two profiles_ explains.
A day to seconds is the finding.

**An empty box updates and never inserts**, and that one `if` was a defect found by counting rows
rather than by reading code. A page of the queue posts all 24 of its boxes whether or not anybody
typed in them, so the obvious upsert wrote an empty `photo_translation` row for every piece
somebody scrolled past — 24 rows from a save where one field had been filled in. Nothing broke,
because the progress screen counts non-empty fields and every public read has `nullif` in front of
its `coalesce` for exactly this shape, which the Drive import already produces. But a row that
means "not translated" is a row that should not be there. F51.

**What is not translated is archival criteria, not code**, and it has its own document:
[TRANSLATION.md](./TRANSLATION.md) carries the reasoning, the per-language glosses for the local
terms — `carneada (a rural animal-butchering gathering)`, the shape this document already used —
and the procedure for adding a fifth language. The machine-readable list is `PROTECTED` in
`src/lib/glossary.ts` and **the document does not repeat it**, for the same reason `frame-src` is
built from `MAP_HOSTS`: two copies of one fact is how one of them goes stale. `missingTerms()`
warns beside the box when a protected term is in the Spanish and gone from the translation, and it
is advisory rather than a gate. The entry it exists for is **"María Luisa", which is a locality in
this archive** — and which is also, in `espacios-070`, a woman's given name, so the rule is to read
the sentence rather than to match a string.

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
lives in the message files, translated once in each of the four languages since T13, because today
exactly one kind of warning exists. The two halves of the promise hold in every language: a
sensitive photograph is never the `og:image` and its page carries `noimageindex` on `/en` exactly
as on `/`.

| Where                      | Behavior                                                                                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gallery grid               | Blurred thumbnail with a restrained label. One click reveals it. Not hidden: blurring gives informed choice, hiding would erase the archive.                                                                  |
| Photo detail page          | A card with the text **before** the image, the image blurred behind it, and a "Ver la fotografía" button. This is what fixes direct access.                                                                   |
| Search results             | Same as the grid. **Decision: sensitive photos appear everywhere, blurred** — excluding them from search would create the incoherence of searching "carneada" and not finding the carneadas.                  |
| Viewer preference          | Built: the "Contenido sensible" switch in the header's settings panel, remembered in `localStorage`. A researcher does not click 30 times; a casual visitor keeps them covered. **Not a cookie** — see below. |
| Sharing and search engines | If a photo is sensitive it is **never used as `og:image`**, and its page carries `noimageindex`.                                                                                                              |

The per-section intro still exists (`category_translation.intro`), so they can keep the notice they
wrote as context. It is no longer the mechanism, just courtesy.

**The preference is `localStorage` and a class on `<html>`, never a cookie**, and that follows from
the pre-rendering decision above rather than from taste. A cookie has to be read on the server, and
reading one in the public layout would make every pre-rendered route dynamic — the whole archive
rendered per request so that one reader can see a blur come off. So a small inline script writes the
class before first paint and unlayered CSS does the rest. With JavaScript off nothing runs and the
veil stays, which is the direction a failure here has to fail in.

**The switch is authoritative in both directions.** Turning the veil back on also closes any photo
page's own `<details class="reveal">`: the rule that lifts the blur for one photograph outlives the
preference otherwise, so a reader who asked to be covered again would go on looking at the carneada.
Caught in review and never shipped, which is the only reason it is worth a paragraph: the failing
gesture is invisible, because the panel hides that card's label while the preference is on.

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

**Amended at the maintainer's request: the archive deletes nothing.** The escape valve is now
hiding, not removal. What follows is the mechanism as it stands, and then what the amendment costs,
because it costs something real and this is the place that has to say so.

How hiding a photograph works:

1. Panel → the photo → **Despublicar** (`published = false`).
2. The detail page starts answering 410, drops out of galleries, search and sitemap, and the
   affected routes are revalidated.
3. **No file is touched.** Every rendition stays in R2 under the key the row still names, which is
   what makes publishing again one boolean instead of six encodes off a master that may live in
   Drive.

**What that gives up, stated plainly.** A rendition keeps answering at its own URL after the
photograph is hidden. The bucket serves images directly -- that is the free-egress design a gallery
depends on -- so `published` is something only the site reads, and hiding is invisible to anyone
holding the file's address. Nothing links it once the photograph is hidden, and the keys carry a
random component so it cannot be guessed or walked, but a link written down before still resolves.

So **hiding is not a takedown**, and the footer invites takedown requests on every page. The gap is real
and it is not closable in application code: honouring one means the bucket refusing to serve the
object, which is bucket configuration -- the same change F16 and F35 already carry into T14, where
`masters/` comes off the public domain. Until that exists, a neighbour who asks for their photograph
to be removed gets it hidden from the site and the file survives. Whoever runs the archive should
know that before promising otherwise.

The metadata, the master and the renditions all stay, so no research work is ever lost by hiding
something -- which is the reason the amendment was asked for in the first place.

**How the 410 is produced, as built in T10.** No page in Next 16 can choose its status code:
`notFound()` gives 404, `forbidden()` and `unauthorized()` give 403 and 401, and there is nothing
else -- so the two ways out F29 recorded turned out not to exist, since a `route.ts` also cannot sit
at the same path as a `page.tsx`. The one place in the framework that can put an arbitrary status on
a URL is `proxy.ts`, so `src/proxy.ts` answers 410 for a slug that is on the takedown list — in any
of the four languages, because it reads the slug out of the path with the locale prefix stripped.
`/en/foto/campo-078` and `/foto/%63ampo-078` both answer 410; verified on all four, encoded
spellings included. It reads that list from `/api/gone` rather than from the database, because a
lookup per request would put Neon back in the request path -- the one thing the pre-rendered design
exists to avoid -- and it memoizes the answer for two seconds. The proxy carries no authorization:
T9's decision that a proxy is not an auth boundary still stands.

**What the proxy costs, and what the memo actually bounds.** T13 widened the matcher to every
public path — the locale routing needs it there — so the guard moved from the matcher into the
function: the takedown list is still read only for `/foto/…`, and a gallery pays nothing for it.
This runs on every `/foto/:slug` request, prefetches included, so it was measured on the production
build rather than reasoned about.
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
pages are pre-rendered, and while they were also `dynamicParams = false` the pre-rendered copy was
the only copy: expiring it with `revalidateTag(tag, { expire: 0 })` left nothing to serve and nothing
to regenerate it from, and `next start` then answered **404 for every photograph and every gallery**
with `NoFallbackError` until the process restarted. Measured, on the way to shipping T10, and the
reason the profile below was chosen; T12 made the route dynamic, so the cliff is gone but the
profile is still the right one -- serving the old page beats regenerating on the reader's request. So
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

**Every public route is `dynamicParams = true`, and it took two tasks to get there.** T11 found it
first: the panel can create a section, and a slug that did not exist when the site was built has no
entry in `generateStaticParams` and therefore no route at all -- the panel would report success and
`/categoria/<slug>` would answer 404 until somebody deployed. So both gallery routes render an
unknown slug on demand.

`/foto/[slug]` was left at `false` then, and the reason was written down: it lists every photograph,
published or not, **because the set of slugs is fixed by the archive**. T12 is what made that
premise false. The Drive import mints slugs from the panel, so a photograph imported today had no
entry either -- and the failure was worse than the section's, because the galleries are already
dynamic and were listing it: measured on delivery, `/categoria/campo/4` showed the three imported
photographs and every one of their links answered 404. A feature that produces broken links on the
public site.

So the fix is T11's, one level down, at the same price. `generateStaticParams` still pre-renders
every photograph at build time, so nothing the archive already holds got slower; `getPhoto()`
returns null for a slug that is not there, which is `notFound()` exactly as before; and the takedown
still answers 410 through the proxy. A made-up slug now costs a function invocation, the same
exposure `/buscar` and both gallery routes already have, which F31's rate limiting covers. Verified
by importing a photograph **after** the build and loading its page: 200, with its own derivatives,
while an invented slug still answered 404.

**What `dynamicParams = false` used to cost, kept because it explains the shape of the code.** The
pre-rendered copy was the only copy, and nothing could make another until the next build:

- **`revalidatePath('/foto/<slug>')` evicted that page's only copy**, and the photograph then
  answered 404 **until the next deploy** -- the `{ expire: 0 }` failure narrowed to one page. Tried
  in T10 to close the window above, and rejected. A route that can regenerate cannot be left with
  nothing to serve, so this is no longer a one-way door. Nothing calls it either way.
- **`generateStaticParams` lists every photograph, published or not**, and still should. Filtering
  by `published` meant a photograph taken down before a deploy had no route afterwards: the panel
  would publish it, regenerate its derivatives, report success, and the page would go on answering 404. That particular trap is gone with `dynamicParams`, but an unpublished slug costs one
  build-time render that ends in `notFound()` and buys a pre-rendered path, which is still the
  better trade. Invented slugs cost nothing at build time, because the list never leaves the archive.

Two technical consequences that must be decided before writing code, not after:

- **R2 keys cannot be guessable.** If they were `photos/campo-078/web.avif`, anyone could derive
  the rest of the archive from a single URL. They carry a random component per photo. This mattered
  more once hiding stopped deleting anything: unguessable is now the _whole_ of what keeps a hidden
  photograph out of reach, rather than a second line behind the delete.
- **Renditions and masters both sit in the same public bucket, and nothing the panel does removes
  either.** The masters were always kept -- by design in Drive, and today, for all 592, as the copy
  rescued from Sites living in R2 behind the same public domain as the derivatives. Since the
  amendment the renditions are in exactly that position: random key, linked from nowhere, reachable
  by anyone who wrote the URL down. Closing it means keeping both prefixes off the public domain,
  which is bucket configuration rather than code, and it belongs with F16 and F35 in T14.
- **Google keeps cached copies.** Unpublishing does not remove it from the index immediately; that
  needs the Search Console removal tool. It is procedure, not code, and T14 wrote it down **in the
  panel**, in Spanish: `src/app/admin/takedown-help.tsx`, a collapsed `<details>` inside
  _Publicación_ on the photograph's own screen, drawn **only while the photograph is hidden**. It
  took two moves to get there. It was first `docs/OPERACIONES.md`, which Lautaro and Marcos have no
  way of reaching; then a block on the panel's home, which they reach and would never think to open.
  On the photograph it appears at the one moment there is something to do about it, and it can do
  what neither earlier version could: **print this photograph's own address**, built from
  `SITE_URL` exactly as the sitemap's are, so it is the string to paste rather than an example to
  adapt. **There is no second copy**: this bullet points at that file rather than repeating it.

**There is no `/sobre` page, and that is a decision rather than a gap.** It sat in the repository
layout from the beginning, no card ever built it, and T6 removed the only link to it -- so what was
being planned was a page nothing reached, to carry a promise that has to reach everybody. The
contact address (fototecalp@gmail.com) is in the **footer of every page**, read from
`site_text.contact`, which is strictly more reach than the page would have had.

What the footer does not yet say is the sentence: that this is also the address to write to for a
correction or a takedown. That belongs in `site_text.rights_notice`, which sits in the same footer
and which the panel edits **without a deploy** -- so it is the authors' own wording, theirs to write
and to change, which is the rule the whole design is organised by: what is content lives in the
database. Until somebody writes it, the invitation is an email address and not an invitation, which
is F49.

**A result set is not a page of the archive.** Everything above is about the photographs, which are
indexed. `/buscar` itself carries `noindex, follow`: an open search box is unbounded URL space, and
what should be found is the photograph, not the query that reached it.

### The sitemap and robots.txt, as built in T14

`app/sitemap.ts` lists **only published photographs and visible sections**, which is the one line
that separates its query from the two beside it: `listPhotoSlugs` and `countSectionPhotos` feed
`generateStaticParams` and deliberately include what is hidden, so a photograph published from the
panel already has a pre-rendered page. A sitemap is the opposite promise -- it is what the archive
tells Google to come and fetch -- and a hidden photograph's page answers 410. `listPublicPaths` in
`db/queries/gallery.ts` is that query, and it carries `GALLERY_TAG` like every other public read, so
unpublishing drops the sitemap entry with the same `revalidateTag` that drops the gallery.

**Every address is listed once per language, and each entry carries all four `hreflang` links plus
`x-default`.** That is the shape Google documents: an entry has to name every version _including
itself_, and a version with no entry of its own has no return link from the sitemap. It comes to
**2,492 entries** -- 623 addresses (the home page, 30 galleries, 592 photographs) times four --
against Google's 50,000 limit, so `generateSitemaps` would be ceremony. The pages already emit the
same set in `<head>` through `alternatesFor`, and both are built from `locales` and `localeHref`,
which is what stops the two from disagreeing.

No `lastModified`: `photo` has no `updated_at`, and a column, a migration and a write in every panel
action to fill a field Google treats as a hint is not a trade this archive should make. No
`changeFrequency` and no `priority` either, for the simpler reason that Google has said publicly it
ignores both.

`robots.txt` allows everything except `/admin` and `/api`, and the interesting line is the one that
is **not** there: `/buscar` is deliberately crawlable. It carries `noindex, follow` in its own
metadata, and a crawler has to be allowed to fetch the page to read that -- disallowing it would
hide the `noindex` and leave Google free to index the address anyway from links pointing at it.
`follow` is the other half, since the results are a path to photographs that should be indexed.

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

### The headers, as built in T14

They are set in `next.config.ts` under `source: '/:path*'`, and each half of that is a decision.
`headers()` rather than `proxy.ts`, because Next's own documentation calls
`NextResponse.next({ headers })` bad practice -- it can override `Content-Type` and break server
actions and streaming -- and because headers declared here are applied **before the filesystem**, so
a pre-rendered page served straight off the CDN carries them too, which is nearly this whole site.
`'/:path*'` and not `'/(.*)'`, because `*` is zero-or-more and that is what also matches `/`.

| Header                      | Value                                                                   | What it closes                                      |
| --------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------- |
| `Content-Security-Policy`   | see below                                                               | Where scripts, images, frames and form posts may go |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains`                                   | A downgrade to http on the apex and on `img.`       |
| `X-Content-Type-Options`    | `nosniff`                                                               | A rendition sniffed into something executable       |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                                       | A photograph's full path leaking to another site    |
| `X-Frame-Options`           | `DENY`                                                                  | `frame-ancestors` again, for browsers that lack it  |
| `Permissions-Policy`        | camera, microphone, geolocation, payment, usb, browsing-topics all `()` | Capabilities the archive never asks for             |

`preload` is deliberately **not** on the HSTS header. The preload list is a one-way door that takes
months to leave, and a year of `max-age` over the apex and the image subdomain is the whole of what
this archive needs. `X-Frame-Options` is redundant with `frame-ancestors` on any current browser and
is kept anyway, because _Mobile first_ is written for old embedded WebViews and that is exactly
where it is the only one of the two that lands.

The policy:

```
default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none';
form-action 'self' https://accounts.google.com;
img-src 'self' data: <NEXT_PUBLIC_IMAGE_BASE_URL>;
font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline';
connect-src 'self'; frame-src https://maps-api-ssl.google.com https://maps.google.com https://www.google.com
```

Four things in it are load-bearing and were checked against the running build rather than reasoned
about:

- **`img-src` is built from `NEXT_PUBLIC_IMAGE_BASE_URL`**, the same variable the `<img>` tags are
  built from, so the header follows the bucket from `pub-….r2.dev` to `img.fototecalapelada.com.ar`
  with no second place to remember.
- **`frame-src` is built from `MAP_HOSTS` in `src/lib/url.ts`**, the same list `mapEmbedUrl`
  enforces. Two copies of one fact is how one of them goes stale, and the failure would be silent:
  a pin moved to a host the guard allows and the header does not renders an empty frame and no
  error anybody would look for.
- **`font-src 'self'` is enough**, because `next/font/google` downloads the files at build time and
  serves them from `/_next/static/media`. Verified: the build contains the `.woff2` files and no
  reference to `fonts.gstatic.com` anywhere, and the rendered page carries no external stylesheet.
- **`/admin` gets one extra source and nothing else**: `https://*.googleusercontent.com` in
  `img-src`, for the thumbnails the Drive import picker shows straight from Drive. A wildcard rather
  than the `lh3.` the code comment names, because Drive hands out `thumbnailLink` on whichever
  `googleusercontent.com` host it likes and a pinned subdomain would break the picker one day with
  an empty square. It is a second `headers()` entry placed **after** the general one, since when two
  rules set the same key the last match wins -- checked with a real request, because "last wins" is
  the kind of documented behaviour that is worth one `curl`.

**`script-src` carries `'unsafe-inline'`, and that is the honest cost of the pre-rendering.** Next's
CSP guide offers two shapes. The nonce is generated in the proxy and read with `headers()`, which
its own documentation says **forces dynamic rendering on every page** -- the whole pre-rendered
archive rendered per request, which is the cross-cutting decision this project rests on, traded for
a header. The other is `script-src 'self' 'unsafe-inline'` in `next.config.ts`, which is what this
is. `experimental.sri` is a third option and a third experimental flag, and it still would not cover
the archive's own inline script: the one in the public layout that puts `show-sensitive` on `<html>`
before first paint, which exists precisely so that no round trip happens before the veil is decided.
Verified that it is load-bearing rather than assumed -- with the policy live, the class is on
`<html>` after a reload, so a strict policy would silently take the sensitive-content preference
away.

What the policy still buys with `'unsafe-inline'` in it is most of the value: no external script
host, no `eval` in production, no plugins, no framing, no form posting anywhere but here and
Google's sign-in, and images from nowhere but the archive's own bucket. And the injection it gives
up on is the one this site has least of -- nothing renders user HTML, React escapes every string,
and the two fields that reach an `href` or an `<iframe src>` go through `src/lib/url.ts` first.
`style-src` carries it for two reasons that are not going away either: `experimental.inlineCss`
turns every stylesheet into a `<style>` tag on purpose, and React writes `style` attributes for the
per-photo `aspect-ratio` that keeps CLS at zero. `'unsafe-eval'` is added in **development only**,
which is Next's own instruction.

### The rate limiting, as built in T14

A fixed-window counter in memory, `src/lib/rate-limit.ts`, in the two places _Security_ names and
nowhere else. F31 is what it closes.

- **Search: 30 a minute per address**, answered with 429 and `Retry-After` from `proxy.ts` -- the
  same reason the 410 lives there, that a page cannot choose its status code. It is charged only to
  `/buscar`, in any of the four languages: every other public route is pre-rendered or ISR and
  answers from the CDN, so counting them would throttle a reader scrolling a gallery to protect a
  database they never reach. Thirty is set by **who shares an address** rather than by how fast
  anybody types -- rural mobile data and a village put many readers behind one CGNAT address, so a
  tighter limit is a school hitting 429 on a Tuesday -- and it is still three orders of magnitude
  under a scraper.
- **Panel writes: 60 a minute per administrator**, in `outcome()` in `src/app/admin/write.ts`, which
  is the one function every write in the panel already passes through for its revalidation. One
  guard covers all ten actions and no future action can be added without it. Keyed by administrator
  rather than by address, because these endpoints are behind `requireAdmin()` so there is a name to
  charge it to. Sixty is set by the only thing in the panel that writes in a loop, the Drive import,
  which brings one photograph per request at seconds each and so lands nearer twenty.

**What it does not do, stated plainly: it counts per instance.** Serverless runs as many copies as
it likes, so a limit of N is N per instance and a flood spread across cold starts is barely slowed.
The way out is a shared counter with an atomic increment, and the reason it is not here is that a
KV store is a dependency, an account and a variable to lose for an archive whose search reaches a
query cache before it reaches Neon. What this buys is the case it was asked for -- one client, one
loop, thousands of distinct queries -- and that one a `Map` stops. `npm run ratelimit:smoke` covers
the counter itself, including the bounded-memory cap: a limiter that grows a `Map` without bound is
a better denial of service than the one it prevents.

### Verifying the bundle, as built in T14

`npm run secrets:smoke` is ARCHITECTURE's own instruction -- "grep the generated client files for
any key" -- made repeatable, because it is the one check whose failure is unrecoverable: the
repository is public and a bundle is served to everyone. It reads the **real values** out of
`.env.local` and searches for them, which is the only version worth running, since reasoning about
which variables Next inlines is exactly the reasoning `NEXT_PUBLIC_` exists to make unnecessary.

Three shapes of each secret are searched -- raw, JSON-escaped and URI-encoded -- and the Drive
service account is additionally decoded so its `private_key`, `private_key_id` and `client_email`
are searched too, since a leak of the JSON would not match the variable's own base64. "The client"
is both `.next/static` and the prerendered `.html`/`.rsc`/`.body` responses under `.next/server/app`.
The server's own chunks are reported and never failed on: a value there is a secret doing its job.

It also asserts the run was not vacuous, which is the way a check like this fails quietly: the two
`NEXT_PUBLIC_` values **must** appear in the client files, or the build was made without them and
the scan was searching a bundle that is not the one production serves. Measured on this build:
4,682 client files, 12 secrets, zero hits, and both public values present.

---

## Production

Everything in this section is configured at a platform rather than in the repository, which is why
it is written down: none of it is visible in a diff, and the maintainer is not the only person who
should be able to find it.

### Domains

| Address                       | Serves             | Where it points                                                                                                                                   |
| ----------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fototecalapelada.com.ar`     | The archive        | Vercel. This is the canonical origin and the value of `NEXT_PUBLIC_SITE_URL`, so it is what every address in the sitemap is written with.         |
| `www.fototecalapelada.com.ar` | Nothing of its own | Vercel, redirecting to the apex. Somebody will type it; one address per page is the whole point of the permalink.                                 |
| `img.fototecalapelada.com.ar` | The renditions     | Cloudflare R2 as the bucket's custom domain. `NEXT_PUBLIC_IMAGE_BASE_URL`, and therefore also the one non-`'self'` source in the CSP's `img-src`. |

The `.com.ar` is registered at NIC Argentina and is the only recurring cost in the project. It is
billed yearly, and it is the one item on this page that stops working on a date rather than on a
change: put the renewal somewhere that is not one person's memory.

**`pub-….r2.dev` is turned off once `img.` answers.** It is R2's development URL, it exposes the
bucket at a second public address, and while it is on there are two ways to reach every rendition
and only one of them is in the CSP. That is F16.

**`masters/` is kept off the public domain**, which is F35 and the amendment's unfinished half. The
bucket holds two prefixes -- `photos/` for the renditions and `masters/` for the 592 copies rescued
from Sites -- and nothing in the application ever links a master. It is not application code that
can close this: the bucket serves images directly, which is the free-egress design a gallery depends
on, so `published` is something only the site reads. The mechanism is an edge rule on the custom
domain that blocks `/masters/` and answers 404. Until it exists, a master is reachable by anyone who
wrote its URL down, and _Exposure, indexing and takedown on request_ is where that is stated in full.

### Environment variables

They live in Vercel's project settings. The repository carries only `.env.example`, with names and
obviously fake values, and `npm run secrets:smoke` is what proves none of the server ones reached
the bundle.

| Variable                                                                    | In Vercel | Same as development?                                                                                                                                                            |
| --------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`                                                      | yes       | **No** -- `https://fototecalapelada.com.ar`                                                                                                                                     |
| `NEXT_PUBLIC_IMAGE_BASE_URL`                                                | yes       | **No** -- `https://img.fototecalapelada.com.ar`                                                                                                                                 |
| `DATABASE_URL`                                                              | yes       | Same Neon project, pooled string                                                                                                                                                |
| `AUTH_SECRET`                                                               | yes       | **No** -- a second `openssl rand -base64 32`, never the development one                                                                                                         |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`                                     | yes       | Same OAuth client, with the production redirect URI added to it                                                                                                                 |
| `AUTH_URL`                                                                  | **no**    | Auth.js detects the origin on Vercel. It is set locally because `npm run start` is not Vercel and Auth.js will not trust the `Host` header on a platform it does not recognise. |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | yes       | Same bucket                                                                                                                                                                     |
| `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`                                        | yes       | Same key. **Base64 of the JSON, never the JSON file**, and never in the repository -- it is decoded in memory by `src/lib/drive.ts`.                                            |
| `GOOGLE_DRIVE_MASTERS_FOLDER_ID`                                            | yes       | Same folder                                                                                                                                                                     |

The two `NEXT_PUBLIC_` values are the only ones that reach the browser, and both are public by
definition: the address readers type and the address their browser fetches images from. Nothing else
may ever carry that prefix.

### Google OAuth

The production redirect URI is `https://fototecalapelada.com.ar/api/auth/callback/google`, added to
the **same** OAuth client the development one uses rather than to a second client -- a second client
is a second pair of secrets to rotate for no gain, and Google accepts several redirect URIs on one.
The localhost URI stays, because that is how the panel is developed.

---

## What can be changed without programming

The rule that organizes the whole design: **whatever is content lives in the database and is edited
from the panel; only behavior and layout live in code.** The Campo notice is the perfect example of
something that _looks_ like prose and is really structured data.

| Change                                                                       | How                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fix a caption, a year, a credit                                              | Panel → the photo → save. Revalidates its detail page and the galleries it appears in.                                                                                                                                      |
| Flag a photo as sensitive                                                    | Panel → the sensitive checkbox.                                                                                                                                                                                             |
| Add, rename, hide or reorder a category                                      | Panel → categories. The public route appears or disappears on its own.                                                                                                                                                      |
| Move a photo between categories, or put it in two                            | Panel → the photo. The relation is N:N.                                                                                                                                                                                     |
| Reorder photos within a category                                             | Panel → drag (`photo_category.position`).                                                                                                                                                                                   |
| Organize the home page                                                       | Panel → Home: section order and visibility, each section's cover photo, and which photos are featured.                                                                                                                      |
| Change a section's intro text                                                | Panel → category → intro, per language.                                                                                                                                                                                     |
| Change any of the site's own words                                           | Panel → textos del sitio: the home copy, the rights notice, the thanks, the contact, the networks.                                                                                                                          |
| Move the map's pin                                                           | Not from the panel: `site_text.map_embed_url` is fixed and edited in the database. The home page renders it.                                                                                                                |
| Add new photos                                                               | Panel → import from Drive.                                                                                                                                                                                                  |
| Attach an AI restoration                                                     | Panel → the photo → restored version.                                                                                                                                                                                       |
| See what is still untranslated                                               | Panel → traducciones: per language, how much is done and which sections and site texts are missing. Only the seven `site_text` keys that are language are counted; the map, the address and the three social URLs are not.  |
| Write a caption, a section or the site's words in English, French or Italian | Panel → traducciones → the language, which is a working queue; or the same boxes on the photograph, section and site-text screens, saved by the button that is already there. See _The translation editor_.                 |
| Load a whole language at once                                                | Not from the panel: `npm run translations:load` reads the proposal files and writes whatever has no translation yet, never overwriting. It cannot revalidate, so one save in the panel afterwards is what makes it visible. |

These require touching code, and that is as it should be: visual design, viewer behavior, the
structure of the detail page, and adding a new language to the list. **Entering a translation used
to be on that list and is not any more** — T13 built the read path and the screen that says what is
missing, and T15 built the editor that writes one.

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
│   ├── TRANSLATION.md             # what is not translated, and why
│   └── TAKEOUT.md                 # the by-hand half of the archive rescue
├── src/
│   ├── app/
│   │   ├── [locale]/              # public, pre-rendered, localized — a ROOT layout
│   │   │   ├── layout.tsx         #   <html lang>, header, footer
│   │   │   ├── page.tsx
│   │   │   ├── categoria/[slug]/
│   │   │   ├── foto/[slug]/
│   │   │   ├── buscar/
│   │   │   └── creditos/         #   planned, never built (F13); `/sobre` was dropped
│   │   ├── admin/                 # dynamic, authenticated, Spanish strings
│   │   │   ├── layout.tsx         #   the second ROOT layout: <html lang="es">
│   │   │   ├── photos/
│   │   │   ├── import/
│   │   │   ├── categories/
│   │   │   ├── site-text/
│   │   │   ├── translations/      #   the editor: dashboard, queue per language, one writer
│   │   │   └── takedown-help.tsx  #   the Search Console half of a takedown, shown on a hidden photo
│   │   ├── api/
│   │   ├── sitemap.ts             # published photographs only, ×4 languages with hreflang
│   │   └── robots.ts
│   ├── db/{schema.ts,index.ts,queries/}
│   ├── lib/{auth.ts,drive.ts,glossary.ts,images.ts,r2.ts,rate-limit.ts,url.ts}
│   ├── components/                # document.tsx is the two root layouts' shared half
│   ├── proxy.ts                   # locale routing + the takedown 410 + the language switch
│   └── i18n/
│       ├── config.ts              # the four codes, localeHref, splitLocale, alternatesFor
│       ├── request.ts             # next-intl reads the message files here
│       └── messages/{es,en,fr,it}.json
├── drizzle/                       # migrations
├── tools/
│   ├── extract-sites.py           # archive rescue
│   ├── seed.ts                    # archive.json → Postgres + R2
│   └── *-smoke.ts                 # one runnable check per risky piece; secrets-smoke greps the build
└── archive/                       # raw rescue: permanent backup, never deleted
    ├── archive.json               # the metadata: versioned, it is the research work
    └── originals/                 # the image files: gitignored, ~105 MB
```

A single Next.js app, no monorepo: the panel shares types and model with the public site. Fewer
moving parts, one deploy. **There is no `app/layout.tsx`**: `[locale]` has to sit above the public
root layout for `<html lang>` to be true, which leaves `/admin` needing a root layout of its own —
Next's documented multiple-root-layouts case. Cross-navigating between them is a full page load,
which the panel's links to the public site deliberately were anyway.

**It also costs a `not-found.tsx`, and the review is what found that out.** Next inserts a default
not-found boundary at the root layer and at a first layer that is a route _group_. `(public)` was a
group, so the archive used to have one inside its own header and footer and another inside
`<html lang="es">`; `[locale]` is a real segment and the root layout is gone, so the only remaining
default boundary sat **above** the public site's only `<html>`. Every `notFound()` — a mistyped
permalink, a gallery page past the end, a stale link off Facebook — answered with Next's bare
fallback: `<html id="__next_error">`, no `lang`, no stylesheet, no dark ground. Measured on the
production build. `src/app/[locale]/not-found.tsx` recovers the **words** — the archive's own copy,
in the reader's language, read from `next/root-params` because a `not-found.tsx` receives no
`params`, which is exactly what root parameters exist for — but **not the document**: the boundary
is still above the only `<html>`, so a 404 is unstyled. Next's docs name both of this project's
conditions, multiple root layouts and a root layout under a top-level dynamic segment, as the
reason `experimental.globalNotFound` exists; that is a second experimental flag for a page nobody
should reach, so it is F46 rather than a decision taken here.

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

| Risk                                                             | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vercel Hobby is non-commercial use only**                      | The project is non-profit, so it complies. If it is ever monetized, it must move to Pro.                                                                                                                                                                                                                                                                                                                                                                                        |
| **Neon's free tier suspends the database past 100 CU-hours**     | The public site is pre-rendered: the database is touched on publish, not per visit. Search is the only point to watch.                                                                                                                                                                                                                                                                                                                                                          |
| **Photos are 300–2340 px and that already is what was uploaded** | The improvement is not in Google but in the source scans. `master_source` + `drive_file_id` allow replacing them without touching a single metadata field.                                                                                                                                                                                                                                                                                                                      |
| **Google's CDN rate-limits**                                     | Not a download quota: 592 downloads in a row never tripped it, while a token from a page left idle answered 403 at t+61s. The extractor downloads each section right after reading its page, and a 403 re-reads the page for fresh tokens.                                                                                                                                                                                                                                      |
| **Publishing stops being instantaneous**                         | Revalidation is targeted and takes seconds, not a full rebuild.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Old Sites links will break**                                   | Sites cannot redirect. Section slugs are preserved and a notice is left on the old site.                                                                                                                                                                                                                                                                                                                                                                                        |
| **Translations were loaded by machine**                          | 559 pieces per language, 1,677 in all, which is not two people's evening -- so the four languages were machine-translated against the glossary in `docs/TRANSLATION.md` and loaded in bulk, by decision, rather than reviewed piece by piece. Both a missing and a wrong translation are recoverable: the fallback to Spanish is in the SQL, and every piece has an edit box one link away on the translations screen. **Nobody who reads French or Italian has checked them.** |
| **Photo rights**                                                 | The current site states the photos were digitized with their owners' permission. That notice and the per-photo credit are preserved as a requirement, not decoration.                                                                                                                                                                                                                                                                                                           |

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
  new window, and the WhatsApp link preview, which must not show the image. Then the preference,
  both ways and in that order: turn it on, uncover a photograph on its own page, turn it off, and
  confirm the blur is back. Checking only the first half is what made a real defect invisible until
  review went looking for it.
- **Hiding a photograph**: unpublish and confirm 410, removal from galleries, search and sitemap,
  and that **the R2 URL still answers and the row still names it** -- which is the amendment, and
  the reverse of what this line asked for until it landed; then republish and confirm the key is
  **the same one**, since a new prefix would mean something re-encoded. The 410 in **all four
  languages**, encoded spellings included. Watch the clock in both directions: the proxy memoizes
  the gone list for two seconds, so hiding reads 200 for a moment and publishing reads 404 for one.
- **Languages**: load one translation and leave its neighbours without, then check all three states
  on the same section — a translated caption, a photograph with no translation row, and a row whose
  caption is empty. `<html lang>` per route. The four picker buttons, clicked in a real browser and
  followed with nothing but a `Referer`, which is the no-JavaScript path. `hreflang` reciprocal
  across the four plus `x-default`, and a canonical per language. Then **the caches, in both
  orders**: ask for the English route first from a cold cache and then the Spanish one, and then the
  same two the other way round. And the panel, still Spanish end to end.
- **Panel**: sign in with an account outside the allowlist and confirm rejection; import a test
  Drive folder, re-import it and confirm the counts do not move, and unpublish and republish one of
  the imported photographs — that last one is what proves the master is readable from Drive.
- **Security**: `npm run build && npm run secrets:smoke`, which greps the generated client files for
  the real value of every server variable; run `gitleaks` over the full history. Then, against the
  production build rather than `next dev`, because the two do not behave the same: **request the
  headers** and read them off the response, on a pre-rendered page, on `/buscar`, on a static asset
  and on `/admin` -- the last one to confirm it gets the extra image source and the others to
  confirm they do not. Then **load the home page in a browser** and confirm the console is clean,
  the map iframe rendered, the Alegreya faces loaded from `/_next/static/media` and no image broken:
  a CSP that blocks the map or the fonts fails silently everywhere except there. Then reload with the
  sensitive preference set and confirm `show-sensitive` is on `<html>`, which is the inline script
  the policy has to keep working.
- **Rate limiting**: `npm run ratelimit:smoke` for the counter, then against the build: 31 searches
  in a minute from one client, expecting 30 × 200 and then 429 with `Retry-After`, and a gallery and
  a photo page in the middle of it expecting 200 -- the limit is on the database, not on reading.
- **Sitemap**: count the `<url>` entries and the distinct photograph slugs, and confirm the number
  matches `select count(*) from photo where published` and not `count(*)`. Then look for an
  unpublished slug by name and confirm it is absent, and for `/buscar` and confirm the same. Then
  read one entry in full: four `hreflang` links plus `x-default`, all absolute.

---

## Still open

- ~~**Visual identity**~~: settled in T5. See _Visual direction: Álbum_ above.
- **Where the Sites site sits in Drive**: dropped as a question. It only mattered for the Takeout
  route, and there is no Takeout route — the export list has no Sites product. The scraper needs
  nothing but the public URL.
- **People as first-class entities**: dropped. Search covers the surname case, and captions mix
  people with places.
