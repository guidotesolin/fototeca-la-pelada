# Fototeca La Pelada — Task board

> The design and its reasoning live in [ARCHITECTURE.md](./ARCHITECTURE.md). Read it before
> executing any task: the cards here give scope, not the why.

## Workflow

- **`main`** starts with the skeleton (T0). Every task branches off it: `t1-rescue-archive`,
  `t2-db-schema`, and so on.
- **Each task is executed in an independent session** that reads `ARCHITECTURE.md` and its own card
  here. That is why every card states its scope, dependencies and acceptance criteria without
  relying on any prior conversation.
- **Claude does not commit.** When a task is finished it proposes the commit message in English and
  the ticket description; the maintainer reviews and runs it.
- Commit messages in English, conventional-commits style.
- **Code is written with the `ponytail` plugin** (installed and enabled): YAGNI, stdlib before
  dependency, no abstractions nobody asked for, the shortest diff that works. Deliberate shortcuts
  get a `ponytail:` comment naming the ceiling and the way out. Each task session invokes it at the
  start.
- **Next 16 has breaking changes** relative to model training data. Any session touching Next code
  reads `node_modules/next/dist/docs/` first.

## Board

| ID  | Branch                   | Depends on |
| --- | ------------------------ | ---------- |
| T0  | `main`                   | —          |
| T1  | `t1-rescue-archive`      | T0         |
| T2  | `t2-db-schema`           | T0         |
| T3  | `t3-image-pipeline`      | T0         |
| T4  | `t4-seed-archive`        | T1, T2, T3 |
| T5  | `t5-design-proposals`    | T1         |
| T6  | `t6-public-galleries`    | T4, T5     |
| T7  | `t7-photo-detail`        | T6         |
| T8  | `t8-search`              | T6         |
| T9  | `t9-auth-admin-shell`    | T2         |
| T10 | `t10-admin-photos`       | T9, T3     |
| T11 | `t11-admin-home`         | T9         |
| T12 | `t12-admin-drive-import` | T9, T3     |
| T13 | `t13-i18n-public`        | T7, T8     |
| T14 | `t14-deploy-hardening`   | all        |
| T15 | `t15-translation-editor` | T13        |

---

### T0 — Skeleton (`main`) ✅ done

Scaffolding with no functionality: Next.js 16 + strict TypeScript + Tailwind 4, ESLint and
Prettier, `.env.example`, `.gitignore`, a `gitleaks` pre-commit hook, `docs/ARCHITECTURE.md`,
`docs/TASKS.md`, and a README with setup steps in English and Spanish.

_Acceptance_: `npm run dev` starts, `npm run build` passes, `npm run lint` is clean, and no secret
is in the repo.
_Commit_: `chore: scaffold Next.js app with TypeScript, Tailwind and project docs`

### T1 — Rescue the archive

Rewrite the scraper in English as `tools/extract-sites.py`, adding **pacing between downloads and
long backoff on 403** (the failure actually observed). Document the Takeout procedure. Reconcile
both sources.

_Output_: `archive/archive.json` + `archive/originals/<category>/*.jpg`
_Acceptance_: per-category counts match the table in ARCHITECTURE.md; 10 random records verified by
hand against the live site; no photo without a caption.
_Commit_: `feat(tools): add Google Sites archive extractor with rate limiting`

### T2 — Database schema

Full Drizzle schema in English, migrations, Neon connection, the `unaccent` extension and
per-language full-text search configuration.

_Acceptance_: migrations run on a clean database; a smoke test inserts and reads a photo with two
translations.
_Commit_: `feat(db): add Drizzle schema and migrations for the photo archive`

### T3 — Image pipeline

`lib/images.ts` (sharp: AVIF and WebP at three widths, dimension reading) and `lib/r2.ts` (S3
client, **non-guessable keys**, upload and delete).

_Acceptance_: given a sample image it produces the six derivatives; generated keys are not
derivable; deleting leaves the URL unreachable.
_Commit_: `feat(lib): add image derivative pipeline and R2 storage client`

### T4 — Seed the archive

`tools/seed.ts`: `archive.json` → database + R2, with `master_source = 'sites'`.

_Acceptance_: `select count(*)` per category matches T1; SHA-256 of a sample verified against R2;
every photo has a thumbnail.
_Commit_: `feat(tools): seed database and R2 from the rescued archive`

### T5 — Design proposals

Two or three visual directions built on real photos from the archive, to choose together with the
brothers. No production code: the output is a chosen direction and its design tokens.

_Acceptance_: a chosen direction, with palette, typography and grid treatment defined.
_Commit_: `docs: add chosen visual direction and design tokens`

### T6 — Public galleries ✅ done

Layout, home page and per-category galleries. Server Components, mobile first, **content readable
without JavaScript**, pagination with real URLs, per-photo `aspect-ratio`, blurring of sensitive
images.

_Acceptance_: navigable with JavaScript disabled; no layout shift; mobile Lighthouse with simulated
3G green on LCP and CLS.
_Commit_: `feat(public): add layout, home and category galleries`

**Measured on delivery**: 38 prerendered routes, none dynamic (33 pages plus the icon and manifest
routes). Documents on the wire, gzipped: home 33.7 KB, gallery 27.4 KB. 24 of 24 photographs declare
their `aspect-ratio`, which is the structural guarantee behind CLS 0. `tsc`, `eslint`, `prettier` and
`npm run url:smoke` clean.

#### Where it departed from the plan

Kept here rather than in the follow-ups because these are decisions already taken, not open
questions.

- **The packed wall was replaced by CSS multi-column**, with the measurement that killed it, in
  _Grid_ in ARCHITECTURE. It deleted `src/lib/wall.ts`.
- **The typographic scale gained names and lost its Spanish identifiers.** _Language conventions_
  covers identifiers, not only comments; the first pass had shipped `.t-titular`,
  `.t-epigrafe-grilla` and friends, and the comments in Spanish besides.
- **The home page gained the town.** The old home's second half — the map at the authors' own
  coordinates and "Un poco sobre nuestra localidad" — was read off the live site and seeded, because
  the T1 extractor keeps one intro per section and an `<iframe>` is not text. Their fourth paragraph,
  which listed the eleven sections in prose, was dropped at the maintainer's request: the section
  grid sits right below it.
- **The header holds the sections in a `<details>`**, a hamburger on a phone and the word from 640 px
  up, which replaced a scrolling strip of eleven links. "Sobre el proyecto" came out of it, so
  nothing links `/sobre` any more. Search shrank to a magnifier and a field.
- **The footer and the icons came from Claude Design passes**, not from this session's judgement:
  "Álbum cerrado — la última página" for the footer, corner-mounted like the last print pasted into
  an album, and "Favicon Fototeca" for the icons. The icon monogram is **not** the logo's own F, so
  nothing regenerates it — replacing an icon means replacing the file. `tools/make-icons.ts` now
  builds only the header mark, which needs the logo's ground knocked out.
- **Two things the layout needs JavaScript for**, both conveniences that degrade cleanly: the index
  deck (Swiper, desktop only, absent from the server HTML) and `MenuDismiss`, a client component that
  renders nothing and only closes the menu on Escape or a press outside. `<details>` has no light
  dismiss of its own.
- **A manifest and a `theme-color`** now exist (`app/manifest.ts`, and `themeColor` in a `viewport`
  export, which is where this version of Next wants it).

### T7 — Photo detail page ✅ done

`/foto/[slug]`: image, caption, credit, notes, years, categories, previous/next, the warning card
ahead of the image, the A/B original/restored switch, Open Graph metadata (excluding the image when
sensitive), `noimageindex` where applicable.

_Acceptance_: a direct link in a new window shows the warning before the image; the WhatsApp
preview of a sensitive photo does not show it; pinch zoom works.
_Commit_: `feat(public): add photo detail page with warnings and restoration toggle`

**Measured on delivery**: 630 prerendered routes, none dynamic — the 592 photographs plus T6's 38.
The document is 27.0 KB gzipped, against 28.7 KB for a gallery, and the page ships the **same seven
JavaScript chunks as the gallery**: it adds none of its own. CLS 0 with no shift recorded, the copy's
`aspect-ratio` declared from its stored dimensions. On the twelve sensitive photographs the head
carries `robots: index, follow, noimageindex` and **no `og:image` and no `twitter:image`**, with
`twitter:card` falling back to `summary`; on the other 580 the preview image is the largest WebP
rendition. `width=device-width, initial-scale=1` and nothing else, so pinch zoom works. `tsc`,
`eslint`, `prettier` and `npm run url:smoke` clean.

#### Where it departed from the plan

- **Previous and next have no query parameter.** The plan was to carry the source section in one, and
  falling back to the photograph's first section. Reading `searchParams` is a request-time API in
  Next 16, so it would have taken all 592 pages out of the prerender to disambiguate **zero**
  photographs — none of the 592 sits in two sections today. The neighbours follow the first section;
  the `ponytail:` comment in the page names `use cache` (F19) as the way back.
- **The record is as wide as the photograph.** Capped at the content box, floored at 640 px. Under a
  391 px portrait the metadata hairlines used to run most of a metre past the print.
- **The copy is never upscaled**, which is T3's rule applied to display: shown at its own web width or
  narrower, so a 649 px scan is sharp and small rather than large and soft.
- **`PhotoImage` gained one prop**, `veil`. The grid's veil is a small label on a thumbnail whose whole
  cell is a link; this screen needs a card with a real control, stated before the image. The blur
  stays in the component and the page lifts it.
- **Both controls are native**: a `<details>` for the warning and a `:target` pair for the switch, so
  the screen is complete with JavaScript off. The blur reset is `scale`, not `transform` — Tailwind 4
  compiles `scale-110` to the CSS `scale` property, and resetting the transform left the revealed
  photograph cropped by a tenth.
- **Touch targets on this page clear 24 px** (WCAG 2.2 SC 2.5.8). The gallery's pagination, from T6,
  is 16–19 px: F25.
- **`photo.source` and `photo.place` are not shown.** They are empty for all 592 (F4), so the query
  does not read them either.

### T8 — Search and filters ✅ done

Postgres full-text search with `unaccent`, filters by decade, credit and category, all
server-rendered with shareable URLs and CDN caching.

_Acceptance_: "Tesolin" finds "Tesolín" and "educacion" finds "Educación"; filters work without
JavaScript; results have their own URL.
_Commit_: `feat(public): add server-rendered full-text search with filters`

**Measured on delivery**: 631 routes, of which **exactly one is dynamic** — `/buscar`, which is the
trade ARCHITECTURE makes on purpose. Both acceptance criteria hold against the live archive:
"Tesolin", "Tesolín" and "TESOLIN" all return the same 62; "educacion" and "Educación" both return
43, which is the whole Educación section. "carneada" returns 10, nine of them blurred — the tenth
is `campo-067`, whose caption still carries the stale notice (F2). The page ships the **same seven
JavaScript chunks as the gallery and the photo page**, none of its own; over 24 results the document
is 35.9 KB gzipped against a gallery's 35.6 KB for the same 24. CLS 0 with all 24 cells declaring
their `aspect-ratio`, 2 eager and 22 lazy. Every control clears WCAG 2.2 SC 2.5.8: the field and the button 42 px, the
three selects 37. Driven with **JavaScript disabled** end to end: typing, picking a filter,
submitting, paging to results 25–43, and following a result to its photograph all work, and the
sensitive results stay blurred. `tsc`, `eslint`, `prettier`, `npm run url:smoke`, `npm run db:smoke`
and the new `npm run search:smoke` (74 checks) clean.

#### Where it departed from the plan

- **The searchable document is not only `search_vector`.** T2's trigger indexes the caption and the
  notes, and on this archive that is not enough for either acceptance criterion: only one of the 62
  Tesolín photographs names a Tesolín in its caption — the other 61 are `credit` — and "Educación"
  appears in no caption at all, only as a section name. So the query composes the trigger's vector
  with the credit and the section names. Why not fold them into the column instead is in _Data
  model_ in ARCHITECTURE: neither belongs to the translation row, so a trigger on
  `photo_translation` cannot see them change.
- **The CDN header is set in `next.config.ts`, and who wins was verified rather than read.** Next
  puts `private, no-cache, no-store` on a dynamically rendered page and the bundled docs do not say
  what happens when a `headers()` entry collides with that. Measured against `next start`: the
  `headers()` entry wins, and `/buscar` answers `public, s-maxage=3600, stale-while-revalidate=86400`.
- **Search results are `noindex, follow`.** _Exposure_ says everything is indexed, and the
  photographs still are — a result set is not a page of the archive, and an open search box is
  unbounded URL space.
- **The wall and its pagination moved to `src/components/photo-wall.tsx`**, shared with the section
  gallery, so the search results blur a sensitive photograph through the same component rather than
  a second treatment. `Pagination` took an `href` builder in place of a section slug: a section
  paginates in the path and prerenders, a search paginates in the query string.
- **Filters accept only values the archive actually has.** Anything else is dropped rather than
  answered with an empty page — which is also what stops `?credito=<anything>` from minting a cache
  entry per request. The lists are read from the data, so a credit that arrives with the next import
  appears on its own.
- **A search with no words is a browse.** The same query with one predicate fewer, so a decade or a
  credit alone lists what it holds. It cost nothing and it is what the filter labels promise.
- **`websearch_to_tsquery`, not `to_tsquery`**: it takes whatever a person types, quotes and stray
  operators included, and never raises. Phrase search comes free with it — `"escuela primaria"`
  returns 5 rather than the 25 the two words return apart.
- **The three filters offer only what the search reaches.** A menu listing the 1870s to a reader
  who searched "tesolin" is a dead end, and the first version did exactly that. Each filter is now
  computed from the matching set **without its own value and with the other two applied**, which is
  the only variant that does not trap anyone: "tesolin" narrows the decades from fourteen to two and
  the credits from thirty-five to one, while the section menu stays whole so a chosen section can
  still be changed. The chosen value is always kept in its own list, so a combination that finds
  nothing still shows what produced it, at zero.
- **Every option carries its count**: "Deporte (4)", not "Deporte". It is exact, not an estimate —
  taken with the other filters already applied, so choosing an option returns the number it
  advertised. It costs nothing: the counts fall out of the same rows that decide which options to
  offer. The smoke test asserts the property rather than the numbers, for every option of every
  filter and again with a second filter narrowing it: the count must equal the result total.
- **The filters do not apply on change; the button stays.** Asked for and measured rather than
  assumed. It is not a backend question at all — the page is already a plain GET — and it is about
  ten lines of client, the same shape as `MenuDismiss`. Two measurements decided it against:
  arrowing through a closed `<select>` fires one `change` per key, so reaching the fourth option
  would cost four navigations and the 35-credit menu would be unusable from a keyboard; and a
  filter navigation costs a median 677 ms at the 562 ms RTT this archive is read over (105 ms
  locally), so three filters would be three waits instead of one. The counts are what that
  suggestion was really after: they answer "is this worth a round trip" before it costs one.
- **The facets are one query and then arithmetic in memory.** The matching set comes back reduced to
  the three filterable fields and the three lists are derived from it, instead of three more grouped
  queries — one cache entry per query serves all of its pages, and the derivation is a pure function
  the smoke test covers with no database. Its ceiling is a `ponytail:` comment in `search.ts`.
- **`color-scheme: dark` sits on the root, not on `.field`.** It was tried on the control first and
  the menu still opened as a white sheet: Chromium themes a `<select>`'s popup from the document's
  scheme, not the element's. On the root it also darkens the scrollbars and the clear button inside
  a `type="search"`. The rows carry an explicit background besides, because Firefox paints the menu
  with the control's own, and the control is transparent here on purpose.

### T9 — Auth and admin shell ✅ done

Auth.js v5 with Google, email allowlist in the database, admin layout with Spanish strings.

_Acceptance_: an account outside the allowlist is rejected; authorization is checked on the server
on every endpoint, not only in the UI.
_Commit_: `feat(admin): add Google authentication and admin shell`

**Measured on delivery**: 633 routes, of which **three are dynamic** — `/buscar` from T8, plus
`/admin` and `/admin/signin`. The 630 prerendered public routes are unchanged: the route group the
panel needed does not appear in a URL. `npm run auth:smoke` is the acceptance criterion made
runnable and passes on all six cases, and the two that matter were also driven through a real
browser: a direct `GET /admin` with no session answers **307 at the network level** with no panel
markup in the body, and the same still-valid cookie is refused the moment the row leaves
`app_user`. `tsc`, `eslint` and `prettier` clean.

**Verified against Google, end to end**, with a real account and a real OAuth client. The
authorization request carries `scope=openid profile email` and nothing else, `response_type=code`
and `code_challenge_method=S256`, so the flow is PKCE and asks for no Drive access. With `app_user`
empty the account authenticated and was **refused** — `AccessDenied` in the server log, the Spanish
rejection on screen — and after one `npm run admin:add` the same account reached the panel. Both
halves of the acceptance criterion, against Google rather than against a minted cookie.

#### Where it departed from the plan

- **The allowlist is read on every request, not at sign-in.** The `signIn` callback is the obvious
  place and it is not enough: a JWT lives thirty days, so a check made only when the cookie was
  minted would leave a removed administrator with a working panel for a month. `requireAdmin()`
  hits `app_user` per request — memoized with React `cache()`, so one lookup per request and not
  one per component. Two users on an indexed unique column; the revocation hole was the expensive
  option, not the query.
- **The public site moved into a `(public)` route group.** A layout cannot be opted out of, and
  `app/layout.tsx` carried the header, the footer and three database queries, so every panel screen
  would have paid for them. The root layout is now the document and the fonts; the chrome sits one
  level down in each group. No URL changed, and T13 renames `(public)` to `[locale]`.
- **No `proxy.ts`.** Next 16 renames `middleware.ts` to `proxy.ts` and its own documentation says
  the file "should not be used as a full session management or authorization solution" — it runs on
  prefetches and cannot reach the database. An optimistic layer there would add a file and a false
  sense of a boundary that lives elsewhere.
- **`unauthorized()` and `forbidden()` were not used.** They are still behind
  `experimental.authInterrupts` in 16.3.3, and a check that runs inside a Suspense boundary after
  streaming has started renders the 401 UI with a **200**. `redirect()` to the sign-in screen is
  boring and answers 307 at the network level, which is the thing being asserted.
- **`AUTH_URL` joined `.env.example`.** Auth.js refuses an untrusted `Host` unless it recognises
  the platform: true on Vercel and under `next dev`, false under `next start`. The smoke test found
  it as an `UntrustedHost` error the first time it ran. Pinning the origin is the fix rather than
  `trustHost: true`, which would trust whatever header arrives.
- **`email_verified` is required.** The allowlist is keyed by address, so an unverified claim to
  one would be enough to walk in. Google sets the flag false on some Workspace accounts.
- **No adapter and no session table**, as designed: the four Auth.js tables would carry nothing
  the allowlist does not already decide.
- **An email box in front of the Google button was considered and dropped.** The idea was a fourth
  gate: type an address, and only show the button if it is on the allowlist. It is not a gate — the
  button is a form posting to a server action, and `/api/auth/signin/google` answers directly, so
  one `curl` skips it. What it would add is an **enumeration oracle**: anyone could ask the page
  whether an address is an administrator, in a town where the authors' names are published on the
  site. The layer it was reaching for already exists on Google's side, as the Testing audience.
- **The README's Google procedure had to be written twice.** Google replaced the single "OAuth
  consent screen" wizard with **Google Auth Platform**, which splits it across Branding, Audience,
  Data Access and Clients — so scopes are no longer part of creating the app, and the first version
  of these steps sent the maintainer looking for a page that no longer exists. Confirmed while
  setting the client up: Data Access needs nothing at all, because the three basic OIDC scopes are
  granted without being declared.
- **Granting and revoking access is `tools/admin.ts`**, not a screen. No card on this board adds
  user management, so this CLI is it for the life of the project; an invitation flow for two people
  who live in the same town is the version nobody asked for.

**Two bugs found after the first delivery, both fixed here.** They arrived together, as one
report — the panel told an administrator on the allowlist that they had no access.

- **The connection, and the reason the record above once blamed a cold start.** Node 22 races the
  addresses a host resolves to and allows each one `autoSelectFamilyAttemptTimeout` to finish its
  handshake, **250 ms** by default. Neon's `us-east-2` pooler measures **208–311 ms** from
  Argentina: the default is not outside the jitter, it is inside it, so a round trip on the wrong
  side of the line makes Node abandon all six addresses and throw `AggregateError [ETIMEDOUT]`, one
  error per address. Measured: **7 failures in 12** fresh connections, and **0 in 12** at 2 s, with
  the median successful connection halving because it stops cycling first. This is what every
  intermittent failure during T9 actually was — the retries that "fixed" it were coin flips.
  `src/db/connect.ts` now carries the setting and the options all five clients share.
- **The message, which is the worse of the two.** Auth.js turns anything thrown inside the `signIn`
  callback into `AccessDenied`, so a database that failed to answer told a real administrator that
  they were not one. Both paths still refuse the sign-in — it fails closed either way — but they no
  longer give the same reason: an unreadable allowlist redirects with `?error=Unavailable`.

Review found the same conflation a second time, on the other side of the screen, and it is fixed
with them: the sign-in page fell back to "the server is misconfigured" for any code it did not
recognise, so **pressing Cancel on Google's account chooser** — which arrives as
`OAuthCallbackError`, one of the eight codes Auth.js will forward to a browser — told an
administrator the deployment was broken. The page now keeps three kinds of "no" apart: you are not
on the list, something went wrong on the way, and the deployment is broken. Only the last says so.
`tools/admin.ts` was losing data on the same pass: a run without a name overwrote the stored one
with null, so using `admin:add` to check that somebody still had access cost them their name.

**Also closed on the way past**: F8, the `server-only` guard the database client was missing, which
does resolve in Next 16 — a client component importing `@/db` now fails the build.

### T10 — Admin: photos ✅ done

Edit caption, credit, years, place and notes; flag as sensitive and as featured; publish and
unpublish (**deleting the R2 derivatives**); reorder; attach a restoration.

_Acceptance_: unpublishing leaves the detail page at 410 and the R2 URL unreachable; republishing
regenerates the derivatives.
_Commit_: `feat(admin): add photo editing, publishing and restoration management`

**Measured on delivery**, against the real database and the real bucket, on the production build and
not only under `next dev`. Unpublishing `espacios-050` from the panel: its derivative URL answered
**404 the moment the panel answered**, the photograph left its gallery and the search results, and
`/foto/espacios-050` answered **410**. Timed with a stopwatch rather than by eye, because the first
delivery of this card claimed the 410 arrived on the first request and that was luck — the proxy's
memo had happened to expire between the click and the check. What actually happens is 1.9 s of the
stale page, then 404, then 410 at 2.7 s (F37). Republishing brought back four renditions under a **new** random
prefix — the addresses the takedown killed stay dead — and the page answered 200 again. The same
cycle was run with a restoration attached: both sets of derivatives were deleted, **both masters
survived**, and republishing regenerated both. `npm run takedown:smoke`, `tsc`, `eslint`, `prettier`
and `npm run db:seed:verify` clean; the archive was left exactly as found, 592 photographs and 3,342
objects with nothing unreferenced.

The panel adds three dynamic routes — `/admin/photos`, `/admin/photos/[slug]` and `/api/gone` — plus
the proxy. The 592 photograph pages and the 30 gallery pages are still pre-rendered: none of this
appears in the public URL space.

#### Where it departed from the plan

- **The schema needed a column, and this is the decision the card did not have.** `restored_web_key`
  and `restored_thumb_key` existed, `restored_drive_file_id` existed, and there was no master for the
  restoration. A takedown deletes derivatives — so unpublishing a photograph whose restoration had
  been uploaded by hand would have destroyed it, permanently, unless the file happened to still be in
  Drive. `restored_master_key` (migration `0003`) makes the restoration obey the same principle as
  the photograph: master kept, derivatives regenerable. No shorter way out was found that did not
  lose work; not deleting the restored derivatives would have made the takedown a lie for the one
  copy a subject is most likely to object to.
- **F29's two ways out do not exist, and the 410 comes from a proxy.** No page in Next 16 can choose
  its status code, and a `route.ts` cannot sit at the same path as a `page.tsx`, so
  `dynamicParams = true` with a published check still only reaches 404. `src/proxy.ts` matches
  `/foto/:slug` and answers 410 from a list it reads at `/api/gone` — never from the database, which
  would put Neon back in the request path — memoized ten seconds. T9's decision against a proxy was
  about authentication and still stands: this one guards nothing and reads no session.
- **Revalidation takes two tags and two profiles, and the first attempt broke the site.**
  `revalidateTag(GALLERY_TAG, { expire: 0 })` looked right for a takedown and is catastrophic here:
  the public pages are pre-rendered with `dynamicParams = false`, so expiring the entry leaves
  nothing to serve and nothing to regenerate from, and `next start` answered **404 for every
  photograph and every gallery** with `NoFallbackError` until the process was restarted. Found by
  running the cycle against the production build rather than only against `next dev`, which hides it
  by re-rendering everything. `GALLERY_TAG` is now `'max'`; the takedown list carries `TAKEDOWN_TAG`
  and `{ expire: 0 }`, because a route handler always regenerates and stale is the one thing a
  takedown cannot be — with `'max'` the first read after unpublishing still came back empty and the
  page answered 404 instead of 410.
- **`web_key` is a prefix, not a key**, which is what makes the delete path safe to build: it is
  already `photos/<slug>-<random>` and needs no derivation. `dropDerivatives` still refuses anything
  that is not exactly one path segment under `photos/`, because `removePrefix` deletes everything
  below what it is handed and `photos/` would take all 2,750 derivatives with it. Ten unsafe shapes
  are asserted in `npm run takedown:smoke`.
- **Reordering is a number in a box, not drag and drop.** One form for the page of rows, one
  statement to save it, scoped to the section so an id from another section moves nothing. It works
  with JavaScript off and cost no library.
- **Uploads cap at 4 MB**, set in `serverActions.bodySizeLimit`. Not the 40 MB `lib/images.ts`
  accepts: a serverless function on Vercel refuses a request body over 4.5 MB whatever the framework
  is told, so the honest ceiling is below that. The way past it is a presigned upload straight to R2,
  which is also what Next's own guidance recommends.
- **Moving a photograph between sections is not here.** The card scopes the fields, the flags,
  publishing, reordering and the restoration, and T11 owns categories. F36.
- **`tools/seed.ts` had to learn about restorations.** Its verifier asserts that no object in R2 is
  unreachable from a row, and it only knew about `master_key` and `web_key` — so the first real
  restoration would have been reported as two orphans.

#### What the review of this branch changed

Six things were measured rather than argued, and four of them were defects.

- **The proxy fetched the takedown list once per request, not once per instance.** 24 concurrent
  requests from a cold start — which is exactly a gallery prefetching its page of photographs —
  produced **24 separate fetches**. `refresh()` now keeps the in-flight promise, and the same test
  produces **1**. Measured cost of what is left: `/foto/[slug]` TTFB is **180–191 ms** on a cold
  instance against **76 ms** for a gallery, which carries no proxy, and **9 ms** warm. A stale memo
  no longer blocks either — 25 ms, because the refresh runs behind the answer.
- **The memo went from ten seconds to two, because the window is not what it was documented to be.**
  It is not "404 where a 410 belonged": until the memo catches up the photograph's page is still the
  pre-rendered one, **200, with the caption on it**. The image is already dead by then, but the
  caption is the part that names living people.
- **A republished photograph answered 410 for as long as the memo lasted** — telling a crawler a live
  page is permanently gone, which is the one answer that cannot be taken back. The proxy now confirms
  the list before it says 410, and that direction measures clean: 404, then 200, never 410.
- **`generateStaticParams` had to stop filtering by `published`.** It runs at build time and never
  again, so a photograph unpublished when the site was built had no route: publishing it from the
  panel wrote the row, regenerated the derivatives, reported success, and the page went on answering
  404 until somebody deployed. Verified by building with the photograph down and republishing it
  afterwards — 404 before the change, 200 after.
- **`revalidatePath('/foto/<slug>')` is a landmine and was rejected.** It was tried, to close the
  window where the stale page still serves. On a route with `dynamicParams = false` it evicts the only
  copy there is, and that photograph then answers **404 until the next deploy** — the same family of
  failure as `{ expire: 0 }`, narrowed to one page instead of the whole archive.
- **`npm run auth:smoke` now covers T10's writes.** A server action is a POST endpoint with a public
  URL, so the T9 criterion applies to it: the test scrapes the `$ACTION_ID` Next renders for the
  no-JavaScript form and posts to it three ways — allowlisted, revoked with the same live cookie, and
  anonymous. Every post names a slug that does not exist, so it can never write whatever the answer.
  Confirmed to fail: removing one `requireAdmin()` turns it red.
- **The panel's Spanish stopped naming the storage.** The screen said "se borran sus derivadas de
  R2", "410" and "master" to two history teachers, which describes the machine rather than the
  archive. Publishing now reads "sale del sitio: deja de aparecer en las secciones y en el buscador
  … la copia original queda guardada", and "Copia web", "Master" and "sin derivadas" became "En el
  sitio", "Copia original" and "no está publicada". The AI restoration is named as one, on the
  maintainer's call: **Versión restaurada con IA** in the panel, and the public page's A/B pair
  became **Original / Restaurada con IA** — the one place a reader could take the interpretation for
  the document. The `#restaurada` fragment is untouched, because it is an address somebody may
  already have shared and the CSS switch keys off it.
- **The panel has one client component now, and it is the file field.** A bare `<input type="file">`
  shows a grey button and a filename, and the whole point of choosing this file is seeing which
  photograph it is: `file-picker.tsx` adds a preview, the size, and a "Quitar" that clears the input
  itself rather than only the preview. It degrades — the input is a real one sitting invisibly over
  its own label, so with JavaScript off the label still opens the picker and the form still submits.
  `opacity-0` and not `sr-only`, because a `required` control clipped to a pixel cannot be focused
  and a browser will not submit a form it cannot show the error on. The filter row also got one
  height: the two selects, the search box and the button measured 39, 40 and 33 px, each sizing from
  its own font.
- **A save says so, and then gets out of the way.** The outcome used to be a banner that stayed
  until the next navigation; it is now a notice over the foot of the screen that leaves after five
  seconds. **No JavaScript**: the dismissal is a second CSS animation, delayed and holding its last
  frame, which under `prefers-reduced-motion` loses the movement and keeps the disappearing.
  Failures deliberately do not use it — they stay in the flow until they are dealt with.
- **"It took minutes to show" was the client cache, and the fix is an anchor.** Reported after
  editing a caption. The server was never the problem: measured, the new text is served on the third
  request, about two seconds later. Next keeps a statically generated page in the **client** for five
  minutes, and a `Link` both prefetches into that cache and navigates from it — so the page reached
  from the panel right after saving is the one from before the save. "Ver en el sitio" and "Ver el
  sitio" are now plain `<a>`: a document load has no client cache, and those two links exist for
  exactly this check.

#### What the code review changed

Fifteen findings, all applied. The ones that were bugs rather than tidiness:

- **`db:seed:verify` went red on the first takedown.** It asserted that _every_ photograph has a
  thumbnail in R2, which unpublishing deliberately makes false — the tool this branch had just
  extended to guard the orphan invariant was crying wolf over normal use. The assertion is scoped to
  published rows now, and its complement was added: **no unpublished photograph may still name a
  derivative**, which is the takedown's own promise stated as a check.
- **The "Con versión restaurada" filter ignored the section and the search box.** A raw `sql`
  fragment carrying a top-level `or` escaped the surrounding `and()`; printed, the clause read
  `(A and B and C) OR D`. Rebuilt with `or(isNotNull(...), …)`, which Drizzle parenthesizes, and the
  emitted SQL was checked again.
- **A restoration was rendered at the photograph's widths**, so any restoration whose master differs
  in size asked R2 for files that were never encoded. `restored_web_width`/`restored_web_height`
  (migration `0004`) carry its own, which is F28 closed. Verified end to end: a 700 px restoration on
  a 1440 px photograph now emits `-480` and `-700` and all four renditions answer 200.
- **Publishing the 25th photograph of a section could produce a 404 link.** `generateStaticParams`
  for `/categoria/[slug]/[page]` counted published photographs only — the same build-time freeze this
  branch had already fixed for `/foto/[slug]` and left open next door.
- **Reordering renumbered one page over another.** `position` orders the whole section but the form
  submitted only the 48 rows on screen. A section is listed whole now — 104 rows at the largest — so
  the collision cannot be expressed.
- **A takedown never reached `/buscar`.** See _Search runs on the server_ in ARCHITECTURE: the CDN
  entry T8 bought to protect Neon kept serving a withdrawn caption for up to an hour.
- **`/foto/%63ampo-078` walked past the 410.** The proxy compared the raw pathname while Next matches
  on the decoded one. Measured before and after: 404 then, **410** now, for three encoded spellings.
- **`?ok=__proto__` crashed the panel**, because the outcome lookup indexed a plain object with a
  value from the address bar and got `Object.prototype` back. `messageFor` reads own properties only.
- **The proxy never backed off from a failing `/api/gone`.** `memo ??=` left the timestamp untouched,
  so a broken endpoint turned one refresh per window into one per request. It also now refuses a
  payload that is not a list, instead of installing `new Set('campo-078')` — a set of letters.
- **R2 writes outside their rollback.** A failed upload mid-`generate`, or a throw between the two
  `generate` calls in `setPublished`, left files no row would ever name. Every write is inside the
  compensating path now; the post-commit deletion of a _replaced_ restoration is deliberately outside
  it, so a transient error there reports the save that happened rather than a failure that did not.
- Plus: the snackbar swallowed clicks for five seconds (`pointer-events: none`), the file picker kept
  its file after a successful upload (remounted by key), the upload hint promised 4 MB when the
  request cap makes ~3.5 MB the honest number, "Destacada" claimed a home strip that does not exist
  (F14), `takedown:smoke` skipped its own cleanup on the runs that fail, and the panel's search
  matched everything when somebody typed `%`.

- **`npm run search:smoke` was broken before this branch and is fixed here.** It died on the
  `server-only` marker the moment a `tsx` process loaded `@/db` — F8's guard doing exactly its job to
  the one tool that is legitimately the server. `--conditions=react-server` in the npm script is how
  a CLI says so; 74 checks pass. Out of T10's scope, in the repository's.
- **`npm run takedown:smoke` stopped assuming six renditions.** It runs the round trip on two masters,
  1600 px and 700 px, which earn six and four files, and asserts the **exact** key set from the naming
  contract rather than a lower bound. T4 measured the archive's average at 4.6 per photograph, so a
  delete that assumed six would leave files alive.

### T11 — Admin: categories, home and site text

Category CRUD with order and visibility, cover-photo selection, and a **Home** view showing how the
home page will look: sections in order and the featured photos.

**And the `site_text` editor**, which this card did not ask for and three other places promise: the
home page's title and intro, the rights notice, the thanks, the authors, the contact address, the
paragraphs about the town, the map embed URL and the three network links. ARCHITECTURE's _Data
model_ says in so many words that "`site_text` becomes editable from the panel in T11", and both
`src/lib/url.ts` and `tools/url-smoke.ts` repeat it in their header comments — those URL guards
exist **because** these values reach an `<iframe src>` and an `href` from a box somebody types into.
Without the editor, _What can be changed without programming_ — the rule that orders the whole
design — has its hole exactly where the site's own words are.

_Acceptance_: creating a category makes its public route appear with no deploy; hiding it removes it
from navigation without deleting its photos; reordering in the Home view changes the home page
order; editing a piece of `site_text` changes the public page after revalidation, and a URL that
does not pass `mapEmbedUrl`/`externalUrl` is refused rather than stored.
_Commit_: `feat(admin): add category management, home organization and site text editing`

### T12 — Admin: Drive import

Drive service account, folder selection, master download, derivative generation through T3, record
creation with `drive_file_id`.

_Acceptance_: importing a test folder creates records with their derivatives in R2 and the correct
`drive_file_id`; re-importing does not duplicate.
_Commit_: `feat(admin): add Google Drive import for preservation masters`

**Four decisions carry this card**, and three of them were forced by something the card did not say.

- **One photograph per request.** A master download plus six encodes plus six uploads is seconds
  each, so a folder in one request does not finish inside the function's duration limit — 60 s on
  Hobby, declared as `maxDuration` on the page, which the route segment config extends to the
  actions the page invokes. The action imports the _first pending_ file and returns; the screen
  decides whether to ask for another. That makes it resumable for nothing — what is pending is
  derived from the database on every render — and it needs no queue and no job system, because Drive
  holds the work list and `drive_file_id` holds the progress. The loop is a hidden submit button
  that presses itself once per render, guarded by a counter that only rises on a real success; with
  script off the two real buttons remain and each click brings one photograph.
- **Idempotency is Postgres's, not the application's.** `drive_file_id` had no index at all.
  `drizzle/0005` adds a **partial unique index** (`where drive_file_id is not null`). The import
  still reads the imported set first, but only so the screen can say which photograph a file became:
  a read before a write is a race, and two administrators pressing the button in the same second is
  precisely what an application check cannot cover. Verified against the real database inside a
  probe that rolls itself back: the duplicate is refused, and many nulls are still allowed.
- **A Drive filename is not a permalink**, so an imported photograph gets `<section>-NNN` — the
  chosen section plus the next free number, T1's own convention, which all 592 existing slugs follow
  with no exceptions. Counted over `photo.slug` rather than the section's membership, because a
  photograph keeps its slug when it moves and reusing a number freed that way would collide with a
  permalink somebody already shared.
- **No `googleapis` dependency.** Two REST endpoints and an RS256 signature, which Node signs in the
  standard library. `src/lib/drive.ts` is 200 lines against tens of megabytes of generated clients.

#### The latent bug this card had to close

`setPublished` asked `if (!row.webKey && !row.masterKey) throw new Invalid('sin-master')` and then
regenerated with `getBytes(row.masterKey!)`. Both assume the master is in R2, which was true of all
592 and is **false by design** for anything imported here: a Drive master leaves `master_key` null
and `drive_file_id` set, permanently, because 600 high-resolution scans do not fit in R2's free
10 GB. So the first photograph ever imported could have been unpublished and **never published
again**, with a perfectly good master sitting in Drive.

Fixed where every caller passes rather than at the one call the symptom names: `readMaster(row)` in
`src/lib/derivatives.ts` is the one door to a master's bytes and reads from either place,
`hasMaster(row)` is exactly its negation, and `setPublished` uses both. Copying masters into R2 was
the other way out and is the wrong one — it breaks the storage split the whole plan rests on.
`FAILED['sin-master']` no longer promises the import as the fix, because for a Drive master it is no
longer reachable.

#### The second thing T12 broke, found by running it

Importing works and the photograph's page answers **404**. `/foto/[slug]` was `dynamicParams = false`
with `generateStaticParams` running at build time, and the reason ARCHITECTURE recorded for it was
that "the set of slugs is fixed by the archive" -- true while the only way in was the seed, which
runs before a build. The import mints slugs from the panel, so a photograph imported today has no
route, and the galleries -- already `dynamicParams = true` since T11 -- list it and link to it:
`/categoria/campo/4` showed the three imported photographs and every link answered 404.

Fixed the way T11 fixed it for sections, which is one line and the same trade: a made-up slug costs
a function invocation, the exposure `/buscar` and both gallery routes already have. Verified by
importing a photograph **after** the build and loading its page.

#### Verified on delivery

`npm run drive:smoke` (new, 33 checks, and 37 once a photograph has been imported): the id guard
refuses the shapes that would escape Drive's
`q` parameter; `hasMaster` is true for a Drive-shaped row, which is the regression assertion;
`readMaster` pulls a real master out of R2 and its SHA-256 matches the row; and `nextPhotoSlug`
gives the right next number for all eleven sections, `inundacion-78 → inundacion-78-032` included.
`npm run auth:smoke` grew two cases: `/admin/import` is 307 anonymous and 200 allowlisted, and
**every exported action in the panel is checked statically to call `requireAdmin()` as its first
statement** — 11 across 4 files. That check was written twice: the first version passed with the
call commented out, because a comment contains the string it was looking for. Both were
negative-tested by removing the gate and watching them fail. `tsc`, `eslint`, `prettier` and the
production build clean; no Drive or R2 credential anywhere in `.next/static`; the archive left as
found at 592 rows.

#### What the review pass found

Seven findings on the finished diff, all fixed here. Three had a concrete failure:

- **The screen's own folder listing sat outside the guard that catches Drive.** `mastersFolderId()`
  and `listFolders()` were wrapped, `listImages()` was not — and an "Importar todas" run re-renders
  this page once per photograph, so a sixty-image folder makes some hundreds of Drive calls in a
  couple of minutes and a 429 is a question of when. That answer threw straight out of the page and
  put the framework's error screen in front of the administrator mid-run, instead of the sentence
  written for exactly this. Every Drive call on the screen is now inside one `try`, and the message
  says a failure may be passing and that what already imported is safe.
- **A section could be created that could never receive a photograph.** `isSectionSlug` admitted 64
  characters because that is what `category.slug` holds, but an imported photograph's slug is
  `<section>-NNN` and `photo.slug` is `varchar(64)` too — so a section slug of 61 or more made every
  import into it fail on the insert, with the panel able to say only "probá de nuevo", for ever.
  Fixed at the source rather than at the symptom: sections cap at **59**, which leaves room for
  `-9999` and makes the state unreachable. The longest slug in the archive is `inundacion-78`, at 13.
- **The static gate check could skip an action in silence.** Its pattern cannot span a parameter
  list containing a closing paren — a callback type, a default like `= new Date()` — and its only
  guard was `gated >= 8` against 11 actions, so a skipped one still read green. It now asserts the
  number parsed equals the number declared, and that was negative-tested by giving `importNext` a
  second parameter and watching it fail.

Four smaller ones: the cached Drive token was never dropped on a 401, so a slow server clock could
have left every call failing for minutes with no way back but a restart (it now retries once, on a
401 and nothing else); `reachable()` listed every subfolder on each import, which is 560 identical
listings over the vault against the same rate limit the screen competes for (it reads the
candidate's own `parents` instead); a `ponytail:` note on the Open Graph image still offered
`photo.master_key` as a JPEG fallback, which is null for an imported photograph and would have
been a null handed to `publicUrl` for the newest photographs only; and this card cited a check count
the tool had outgrown.

**The `parents` change broke something on the way in, and `auth:smoke` caught it.** A folder id that
names nothing gets a 404 from that lookup, which threw where the old listing had simply returned
false — so a wrong folder reported `error=interno` instead of naming the mistake. Drive's status
rides on the error now: 404 and 403 are an answer and become `false`, everything else is rethrown,
because telling somebody their folder is wrong when Drive is merely busy sends them to fix something
that is not broken.

#### The acceptance criteria, run against the real vault

The Google Cloud Console work was done by hand and the whole cycle was exercised through the panel,
against the real Drive, the real bucket and the real database. The vault holds **560 images across
26 folders**, organised by lending family.

- **Import.** `Lelia Lazzroni` (3 images) into Campo, with "Importar todas": the loop ran by itself
  to `3 imágenes · 3 ya importadas · 0 por importar`, minting `campo-080/081/082` — the slugs
  `nextPhotoSlug` had predicted. Each row came back `master_source = 'drive'`, `drive_file_id` set,
  **`master_key` null**, real dimensions read by sharp (1061×670, 1068×676, 1075×698), SHA-256,
  four renditions apiece in R2, appended at positions 80–82. `masters/campo-080.jpg` answers 404:
  no master reached R2.
- **Re-import.** Pointing at the same folder again offers nothing at all — the screen reads 3/3/0
  and draws no buttons. And with the real `drive_file_id` `campo-080` holds, Postgres refuses a
  second row. 595 photographs, 3 Drive ids, 3 distinct.
- **Unpublish and republish, on a Drive master.** `campo-080` unpublished: derivatives 404, keys
  nulled, leaving exactly the row shape the old code could not recover from — `web_key` null,
  `master_key` null, only a `drive_file_id`. Republished from the panel: read from **Drive**,
  four renditions regenerated under a **new** prefix, and the prefix the takedown killed still 404s.
  This is the latent bug, closed and measured.
- **`drive:smoke` grew to 37 checks** with a real import in place: `campo-080` has no `master_key`,
  `hasMaster` says it has a master anyway, and `readMaster` pulls 91,779 bytes out of Drive whose
  SHA-256 matches the row.

**The archive was left exactly as found.** The four test photographs were unpublished through the
panel — which is what deletes their derivatives, through the path built for it — and their rows
deleted: 592 photographs, 592 translations, 592 memberships, Campo back to 79, and
`npm run db:seed:verify` green at 3,342 R2 objects with none unreferenced. The originals in Drive
were never touched; nothing in this task writes to Drive.

### Header redesign — out of band, on `main`

Not a card and not on the board: done directly on `main` between T12 and T13, at the maintainer's
request, from a design covering only the bar's right side. It is written down because it changed
two things a later task will otherwise trip over.

**The sections panel spans the bar** instead of hanging off the word as a 232 px dropdown, so the
eleven sections read at a glance — four columns on desktop, two on a phone. Beside it the search
field is unchanged, and a new settings `<details>` holds the language picker and the
sensitive-content switch. The language buttons are **rendered and inert**: T13 gives them their
hrefs. The switch is live, and _Sensitive content_ in ARCHITECTURE.md now records how it is stored
and why it is not a cookie.

#### The bug the redesign uncovered, which was older than the redesign

**No link in the header menu had ever been clickable.** `menu-dismiss.tsx` closed the `<details>` on
`pointerdown` when the press landed on an anchor inside it; `<details>` un-renders its contents, so
by `pointerup` the anchor was gone and the browser retargeted the click to their nearest common
ancestor, `body`. The menu shut and the page stayed where it was. Measured, and confirmed against
`main` with the old narrow dropdown before the redesign was written, so it dates from T6 — the wide
panel only made it easy to notice, because eleven sections across the bar invite the click that the
one-column dropdown rarely got.

The fix is not "close later". The invariant that branch existed for is _a menu must not outlive the
page it was opened on_, which is about a navigation and not about a click, so it is keyed to
`usePathname()` now. That closes four holes the press-time close had at once: the retarget, closing
on Ctrl- and middle-click where nothing navigates, missing Back, and missing Enter on any link
outside the panel. Closing a `<details>` while the reader's focus is inside it drops that focus on
`<body>` at the next layout, so the close hands it back to the summary — the same thing the Escape
branch already did, and the reason Escape in the search field no longer yanks the reader out of the
field they were typing in.

Two panels also meant the two `<details>` could both be open at once from the keyboard, where the
pointer handler's mutual exclusion never ran. They carry a shared `name` now, which is the browser's
own exclusive accordion; a WebView too old for the attribute ignores it and degrades to exactly the
behaviour of the day before.

_Commit_: `feat(header): widen the sections panel and add language and sensitive-content settings`
— the fix above rode along in it rather than landing on its own, so `menu-dismiss.tsx` is the file
to look at in that commit if a header menu ever stops navigating again.

### T13 — Public i18n ✅ done

`next-intl` over the `/[locale]` routes, fallback to Spanish when a translation is missing, and a
panel view of what is untranslated per language. **The panel itself is not translated.**

The header redesign above already renders the picker — four buttons, ESP/ENG/FRA/ITA, `disabled`
and marked with the current locale. This task gives them their hrefs and deletes the `disabled`; it
does not design a control. The same pass moves the two strings that are copy rather than labels
into the message files: the sensitive-content warning, and the sentence under the switch.

_Acceptance_: `/en/foto/espacios-001` shows the English caption when it exists and the Spanish one
when it does not; correct `hreflang`; the panel stays in Spanish; the four language buttons navigate.
_Commit_: `feat(i18n): add locale routing and translation fallback for the public site`

The decisions and their reasoning are in ARCHITECTURE: _Language conventions_ for the prefix
strategy and the picker, _Cross-cutting decision: the public site is pre-rendered_ for the page
counts and the cache keys, and the _Data model_ bullets for the fallback and the search
configuration. What follows is only what departed from this card.

#### Where it departed from the plan

- **Only `gallery.ts` and `search.ts` became language-aware, and that was deliberate.**
  On `main`, `SOURCE_LOCALE` appears 24 times across six files under `src/`: **fifteen** of them in
  `src/app/admin/**` and `src/db/queries/admin.ts`, which are **correct as they are** — the panel
  writes Spanish, which is the source language — and the nine in `gallery.ts` and `search.ts`,
  which are the ones this task made language-aware. Parameterizing all 24 would have broken the
  panel. The
  constant is now `defaultLocale` under the name the schema has used since T2, so there is one
  literal `'es'` in the codebase and every existing importer kept working untouched.
- **On `main` there are twelve `unstable_cache` calls, not seventeen**, and seven of them became
  per language: `site-text`, `sections`, `featured`, `section-photos`, `photo`, `search` and
  `facet-rows`. The other five read no translation — `archive-facts`, `section-photo-counts`,
  `photo-slugs`, `category-order` and the takedown list — so all four languages share one entry and
  should.
- **The public site has no `app/layout.tsx` any more, and `lang` is why.** An English page
  announced as Spanish is mispronounced by a screen reader and offered a translation it does not
  need, and `lang` can only sit on `<html>`, which is the root layout's own element — so the root
  layout has to know the locale, so `[locale]` has to sit above it, so `/admin` needs a root layout
  of its own. `src/components/document.tsx` is the half they share, which keeps the `next/font`
  instances in one place; the comment there explains why the fonts cannot move down a level.
- **`generateStaticParams` returning `[]` for a parent locale silently discards the whole
  segment.** The plan was "Spanish only" for the 592 photo pages, which is `[]` for the other three
  — and Next 16.3.3 answered by pre-rendering **zero** photo pages in any language, Spanish
  included, while `generateStaticParams` was still returning all 592 for `es`. Measured in both
  directions. So the other three get the first photograph of each section instead: 756 pre-rendered
  pages, and the eleven per language are the head of each gallery rather than an arbitrary sample.
- **The language switch is a redirect through the proxy, not an href built in the layout.** A
  layout cannot know the path it wraps; the only server-side way to read it is a request header, and
  reading one would make all 592 photo pages dynamic. `/idioma/<code>` and the `Referer` cost eight
  lines in a file that already existed and keep the reader on the photograph they were looking at,
  with no client state. `no-store` on that redirect is load-bearing: one address, four answers.
- **The `nullif` in front of every `coalesce` is not tidiness, it is the bug.** A translation row
  can exist with nothing in it — the Drive import creates exactly that — so `coalesce(asked, source)`
  alone prefers an empty English caption over the Spanish text. Worse on the search side, where the
  trigger fills `search_vector` on **every** insert: an untranslated row carries an _empty_ vector
  rather than a null one, so without `nullif(…, ''::tsvector)` a language would go quietly
  unsearchable the moment somebody saved a blank field.
- **Search falls back to Spanish, which the card did not say and the archive requires.** With no
  translations loaded, matching English queries against English vectors alone answers nothing for
  all 592 photographs. All four languages find the same 62 Tesolín photographs today, and English
  stemming is real where a translation exists ("tanks" and "streets" both reach it).
- **The UI labels moved to the message files too, not only the two copy strings.** A label left in
  code is a Spanish word on an English page, so all 70 messages live in
  `src/i18n/messages/{es,en,fr,it}.json` — counts included, as ICU plurals, because "1 sección" and
  "11 secciones" share no suffix in any of the four languages.
- **No `NextIntlClientProvider`, and no messages in the browser.** The three client components take
  their strings as props. Measured: the same eight chunks and the same 173 KB gzipped on `main` and
  on this branch, in all four languages. Every server call passes its locale explicitly, because
  letting next-intl resolve it reads a request header and opts the component into dynamic
  rendering — which would have cost the pre-rendering the whole design rests on.
- **A stale cache reads exactly like the bug this task was warned about.** Loading a translation
  straight into Postgres does not call `revalidateTag`, so the day-long entry keeps serving Spanish
  and it looks like a leaking cache key. It is not: the keys are distinct, and a cold cache proves
  it in both request orders. It is F42, and it matters for T15.
- **The language switch shipped with an open redirect, and the review caught it.** The proxy read
  the page out of the `Referer`, checked that its origin was ours, and handed the pathname to
  `new URL(path, origin)` — which resolves a pathname beginning with `//` as a **new origin**, so
  `/idioma/es` answered `Location: http://evil.example/` for a same-origin referer of
  `https://site//evil.example`. Reproduced against the running build. It fired on the Spanish
  button alone, because that is the one branch where `localeHref` returns the path untouched; the
  other three prefix it and stay on the origin by accident rather than by design. The decision moved
  out of the proxy into `switchHref` in `src/i18n/config.ts` so that it could have a test, and it
  now asserts the built URL's origin rather than matching the path — six hostile shapes × four
  languages in `npm run i18n:smoke`, and those assertions fail against the code that shipped into
  the build before the review.
- **The review found four more defects, and two of them were the interesting kind: a screen that
  was never localized because nobody renders it, and a check that passed for the wrong reason.**
  A ten-lens pass with two adversarial refuters per finding raised 24 and confirmed five.

  1. `src/components/photo-image.tsx` — **a file this task never opened** — carried the
     sensitive-content warning, its "Ver la fotografía" link and the fallback `alt` as inline
     Spanish, on every non-Spanish gallery card, search result, featured strip and section cover.
     The photo page states its warning in a card of its own and passes `veil={false}`, so the one
     screen that got checked was the one screen that never draws them. `labels` is a **required**
     prop now, and the type checker named all four callers.
  2. The search fallback matched a **Spanish-stemmed** stored vector against a query stemmed in the
     asked locale, so `/en/buscar?q=escuela` found 0 where Spanish found 25 — on pages rendering
     those very captions. French and Italian found all 25 by luck, their stemmers truncating
     "escuela" the same way, which made a structural defect look like an English one. The query
     re-tokenizes the coalesced text instead; English goes 0 → 25.
  3. **The four-language check that was cited as proof of the fallback was hollow**: "Tesolin" is a
     credit — 62 credits, one caption — and the credit half of the document is re-tokenized per
     locale either way, so the check was green while the caption path returned nothing. It asserts
     a caption-only word now, and first asserts that the word really is caption-only.
  4. Deleting `app/layout.tsx` moved Next's default not-found boundary **above** the public site's
     only `<html>`: every 404 answered `<html id="__next_error">` with no `lang` and no stylesheet.
     `src/app/[locale]/not-found.tsx` recovers the **words** — the copy is the archive's and in the
     reader's language, read from `next/root-params` because a `not-found.tsx` gets no `params` —
     but **not the document**: the boundary is still above the only `<html>`, so a 404 renders
     unstyled. Measured after the fix, not assumed. Next's own docs name both of this project's
     conditions (multiple root layouts; a root layout under a top-level dynamic segment) as the
     reason `experimental.globalNotFound` exists, and that is a second experimental flag for a page
     nobody should reach. F46.
  5. `translationProgress` counted the map embed, the contact address and three social URLs as
     translation work, so the screen listed five impossible items per language and could never pass
     7/12. `TRANSLATABLE_SITE_TEXT` in `site-text/fields.ts` is the filter — the same `kind` the
     panel already validates by. The first attempt at it **500'd the screen**, because
     `= any(${array})` makes Drizzle expand a JS array into `($1, $2, …)`, which Postgres reads as
     a record and refuses to cast to `text[]`; `sql.join` into an `in` is the right shape. Caught by
     opening the page, which is what the change should have started with.

  Nineteen findings were raised and refuted, which is the part of the exercise worth keeping: two
  refuters per finding, either one kills it, and the defaults were set to refute.

- **The panel screen lists, it does not edit.** The card asks for "a panel view of what is
  untranslated per language", and that is what `/admin/translations` is: one table of counts per
  language, plus the missing site texts and section names by name and the missing captions by
  section. Entering a translation is T15's, and _What can be changed without programming_ now says
  so instead of promising it.

_Verified_: 423 checks in `npm run i18n:smoke` (key and placeholder parity across the four files,
every message formatted through `use-intl`'s own translator, the `localeHref`/`splitLocale` round
trip, and the language switch against six hostile `Referer` shapes in each language); 90 in
`npm run search:smoke`, including all four text search configurations against the
real archive. Then against `next start`, with one English translation loaded and its neighbours left
without: the three fallback states on the same section, `<html lang>` on eleven routes, the four
buttons clicked in a real browser and followed with nothing but a `Referer`, `hreflang` and
canonical on seven routes, the 410 in all four languages including encoded spellings, and the caches
asked in both orders from cold. 756 pre-rendered pages.

### T14 — Deploy and hardening

Vercel connected to GitHub, environment variables, the `fototecalapelada.com.ar` and
`img.fototecalapelada.com.ar` domains, CSP and security headers, rate limiting, sitemap, Search
Console, and a notice on the old Sites site.

Secret scanning needs no setup: the repository is public, so GitHub push protection is free and on
by default. Verify it in Settings → Code security rather than configuring it.

_Acceptance_: no secrets in the client bundle (verified by grepping the generated files); security
headers respond; the sitemap lists only published photos.
_Commit_: `chore: configure production deployment, domains and security headers`

**The code half is finished; the platform half is the maintainer's** and is not something a session
can do -- buying the domain, connecting Vercel, loading the variables, the DNS, the OAuth redirect
URI, Search Console and the notice on the old Sites site. The decisions those need are written down
in _Production_ in ARCHITECTURE so they are not in one person's memory, and the order they have to
happen in is in the same place: the redirect URI needs the domain, the domain needs the DNS, and the
first deploy fails without the variables.

The reasoning is in ARCHITECTURE: _Security_ for the headers, the policy and the rate limiting,
_Exposure, indexing and takedown on request_ for the sitemap and robots, and _Production_ for the
domains and the variables. What follows is only what departed from this card.

#### Where it departed from the plan

- **`script-src` carries `'unsafe-inline'`, and there is no version of this task that avoids it.**
  Next's nonce recipe forces dynamic rendering on every page, which is the whole pre-rendered
  archive rendered per request in exchange for a header -- and it would still not cover the inline
  script in the public layout that decides the sensitive-content veil before first paint.
  `experimental.sri` is the third option and a third experimental flag with the same gap. The
  ceiling is a `ponytail:` comment in `next.config.ts` rather than a quiet omission.
- **The sitemap is 2,492 entries, not 623.** Google's hreflang shape wants an entry per language,
  each naming all four plus `x-default`, so the four languages do multiply here even though
  _Cross-cutting decision: the public site is pre-rendered_ deliberately does not multiply the
  build. It is the same `flatMap` either way, and it comes to about 1.3 MB against a 50,000-entry
  limit.
- **The sitemap needed a query of its own**, which was the one thing the card's "lists only
  published photos" made unavoidable: `listPhotoSlugs` and `countSectionPhotos` both include what is
  hidden **on purpose**, because they feed `generateStaticParams`. Reusing either would have listed
  a photograph whose page answers 410.
- **Rate limiting landed in two places and neither is a new endpoint.** `proxy.ts` for `/buscar`,
  because a page cannot choose its status code and 429 is one; `outcome()` for the panel, because it
  is already the single function every write passes through for its revalidation, so one guard
  covers ten actions and the eleventh cannot forget it.
- **`npm run secrets:smoke` is new, and it is the acceptance criterion made runnable.** It reads the
  real values out of `.env.local`, searches three encodings of each plus the decoded service-account
  fields, over `.next/static` and the prerendered responses. It also refuses to pass vacuously: the
  two `NEXT_PUBLIC_` values must be found, or the build was made without them. Measured: 4,682
  client files, 12 secrets, zero hits.
- **The Search Console procedure is in Spanish, in the panel**, and it moved twice before it
  landed. The card asks for it to be written so the brothers can do it without the maintainer;
  `docs/OPERACIONES.md` fails that on a plainer reading than language, since they have no GitHub,
  and the panel's home fails it too -- reachable, but nobody opens a help block on the way to
  something else. It ended up inside _Publicación_ on the photograph's own screen, drawn only while
  the photograph is hidden, which is the one moment it has anything to say. Being there also lets it
  print the photograph's real address instead of an example. It reuses `.menu` from `globals.css`
  and adds no CSS, so it opens with JavaScript off like every other disclosure on the site.
- **F46 was left.** The card offered it as "T14 with the rest of the polish"; it needs
  `experimental.globalNotFound`, which is a third experimental flag for a page nobody should reach,
  and it is not hardening. Two new follow-ups came out of the verification instead, F47 and F48.

### T15 — Translations

**Two halves, and the first one is code.** The card used to read "Human work, no new code", and it
was not executable as written -- the two findings that pointed at it are the reason:

- **F45**: `/admin/translations` is read-only. T13 built the screen that says what is missing and
  stopped there, deliberately. There is no write path for `en`, `fr` or `it` in any of the three
  tables: all eleven of the panel's writes are pinned to `SOURCE_LOCALE`, and the only non-Spanish
  write in the repository is a fixture in `tools/db-smoke.ts`.
- **F42**: a translation written straight into Postgres can take a day to appear, because the
  public reads are `unstable_cache` with `revalidate: 86_400` invalidated by
  `revalidateTag(GALLERY_TAG)` -- called in exactly one place in the repository, `outcome()` in
  `src/app/admin/write.ts`, which a `psql` session does not go through.

And the volume is not two people's evening. Measured in the database: **519 captions, 12 source
notes, 11 section names, 10 section intros and the 7 `site_text` keys that are language = 559
pieces per language**, over 45,524 characters of Spanish. Three languages is **1,677
translations**. Today not one row exists in `en`, `fr` or `it`.

#### T15a — The editor _(this branch: `t15-translation-editor`)_

The write path, not the content. Machine translation with human review, so the editor is a screen
for **correcting a proposed sentence** rather than filling an empty field -- a different screen,
and the difference is the point.

- A queue per language at `/admin/translations/[locale]`, filtered by kind and section, 24 pieces
  a page, with the Spanish above each box and the machine's proposal in it, marked unreviewed.
- The same boxes on the photograph, section and site-text screens, **inside the form that is
  already there and saved by the button that is already there**: one Guardar writes the Spanish
  and the three languages in one transaction.
- Every write goes through `outcome()`, so every one revalidates `GALLERY_TAG`. **That is F42
  closed by construction rather than by remembering.**
- The dashboard T13 built keeps its counts and every number becomes a link into the queue,
  filtered to the work it counts.
- A do-not-translate glossary, because "María Luisa" is a locality in this archive and has been
  read as a person once already. `docs/TRANSLATION.md` is the criteria; `src/lib/glossary.ts` is
  the list, and the panel warns beside the box when a protected term went missing.

**No schema change**, and that follows from one decision: the proposals live in JSON files in the
repository and are never written by anything, so a non-empty caption means _a person reviewed
this_ by construction. No `reviewed_at`, no migration, and no path by which an unreviewed machine
translation can reach the public site.

_Acceptance_: a translation loaded from the panel shows on `/en/foto/<slug>` in seconds rather than
a day; a partial translation leaves no holes, because clearing a field falls back to Spanish; the
panel stays in Spanish; everything works with JavaScript off.
_Commit_: `feat(admin): add the translation editor and close the revalidation gap`

#### T15b — The content _(done here, as a second commit)_

The 1,677 translations, loaded. It was scoped to go **after** publishing, so a translation could be
reviewed against the page it appears on; the maintainer chose to do it now instead, and to
correct what turns up rather than gate on a review of 559 pieces per language.

- The 28 pieces that are not captions were translated into **English by hand in the panel**, before
  anything else ran, by somebody who reads English.
- The other **1,649 were machine-translated and loaded in bulk**, glossary applied, without review
  piece by piece. `tools/translations-load.ts` is the path that makes that possible, and it is the
  path _The translation editor_ in ARCHITECTURE used to say did not exist — that section now says
  what changed and why, rather than quietly dropping the claim.
- **It never overwrites**: the 28 hand-translated pieces were kept, and the run reports how many it
  left alone. It also cannot revalidate, so a bulk load is invisible until any one save in the panel
  fires `GALLERY_TAG` — measured: `/fr/categoria/campo` read "Campo" until one unchanged page was
  resubmitted, and then all three languages turned over.

**What is not true of this content**: nobody who reads French or Italian has checked it.
`docs/TRANSLATION.md` says so in the document itself, under _What was actually done, and by whom_,
because a reader of a French caption deserves to know where it came from.

_Verified_: 559/559 in each of the four languages; all four rendering on the home page, the
galleries, the photo pages and search; "carneada" finding 10 in Spanish and its gloss 9 in each of
the other three; the 74 photographs with no Spanish caption still falling back correctly.
_Commit_: `content: add English, French and Italian translations`

---

## Follow-ups

Things found while executing the board and deliberately left. Each one says why it was left and
who it belongs to, so nothing here is quietly waiting on a decision nobody knows about. Shortcuts
_inside_ code are marked differently, with a `ponytail:` comment naming the ceiling and the way
out: `grep -rn "ponytail:" src tools` lists those.

| ID      | What                                                                                                                                                           | Why it was left                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Belongs to                                                    |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| F1      | 73 of the 592 photos have no caption on the live site, only a credit                                                                                           | The source's own state, not a loss in transit. The Drive folder's `Explicacion.txt` and `fotos.txt` are candidate material                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | T10, by hand                                                  |
| F2      | `campo-067`'s caption still ends with "A CONTINUACIÓN, FOTOGRAFÍAS DE 'CARNEADAS'…"                                                                            | The warning is `photo.sensitive` now, so the sentence is stale — but trimming an author's words is not a script's call                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | T10                                                           |
| F3      | The 12 photos flagged sensitive were derived from that one marker, and 3 of them have no caption                                                               | Worth one look from Lautaro and Marcos before the site is public                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | T10                                                           |
| F4      | `photo.source` and `photo.place` are empty for all 592                                                                                                         | The scraper cannot separate a book reference from any other note, and place lives inside the captions as prose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | T10, or never                                                 |
| F5      | The three YouTube interviews in `archive.json` have no home in the data model                                                                                  | One video in three sections is not a schema, and nothing in the design consumes them yet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | T6, if they should show                                       |
| ~~F6~~  | ~~The home page text rescued in T1 is in `archive.json` but not in the database~~                                                                              | **Closed in T6**: `site_text` carries it, plus the town description and the map that the extractor never saw                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | done                                                          |
| F7      | No index on `photo.published` or `photo.featured`                                                                                                              | At 592 rows Postgres sequential-scans regardless                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | when a plan asks for it                                       |
| ~~F8~~  | ~~The database client carries no `server-only` guard~~                                                                                                         | **Closed in T9**: it does resolve in Next 16 -- the marker package's `react-server` export condition is exactly what the App Router reads. `src/db/index.ts` imports it, so a client component reaching the database now fails the build instead of the request                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | done                                                          |
| F9      | `npm audit` reports 4 moderate, all esbuild ≤ 0.24.2 through `drizzle-kit`                                                                                     | Dev-only, and `audit fix --force` downgrades drizzle-kit by thirteen minor versions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | when drizzle-kit moves                                        |
| F10     | A takedown is verified through `HeadObject`, not through a public URL                                                                                          | `img.fototecalapelada.com.ar` still does not exist, so there is no public URL to verify against. It is waiting on the same DNS step as F16, and once that exists the check it wants is also the one that proves F35 closed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | T14, at the platform                                          |
| F11     | AVIF and WebP quality sit at 50 and 78 and were never tuned                                                                                                    | They look right on real photos from this archive and the bytes are already small                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | nobody, probably                                              |
| F12     | A Drive export including every file was never tried, in case it carries the Sites HTML                                                                         | The measured gain is a JPEG encode that the AVIF re-encode erases                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | see TAKEOUT.md                                                |
| F13     | `/creditos` appears in the repository layout but no card builds it                                                                                             | T6 covered the layout, the home page and the galleries, which is what its card scoped. **`/sobre` came out of this row in T14 and is not being built** -- see _Exposure, indexing and takedown on request_ for where the contact procedure lives instead. `/creditos` is still undecided rather than dropped: nothing links it either, and the rights notice and the per-photo credit that _Risks_ calls a requirement are already in the footer and on every photograph.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | unassigned                                                    |
| ~~F14~~ | ~~The home page has no highlights strip~~                                                                                                                      | **Closed in T11**: `photo.featured` and nothing else feeds it — no order of its own, sections first and curatorial order inside each, capped at twelve. The strip is not on the page at all while nothing is marked, which is what made it safe to build against an archive where nothing was                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | T11                                                           |
| ~~F15~~ | ~~Public routes sit at the root, not under `/[locale]`~~                                                                                                       | A locale segment with no i18n behind it is fake structure; next-intl restructures these routes anyway. **Closed in T13**: `(public)` became `[locale]`, and it became the public **root** layout rather than a nested one, because `<html lang>` cannot be set from above a locale segment. No public URL changed — Spanish stays unprefixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | done                                                          |
| F16     | `NEXT_PUBLIC_IMAGE_BASE_URL` points at R2's development URL (`pub-….r2.dev`)                                                                                   | The custom image domain still does not exist: the DNS is the maintainer's half of T14. **The code half landed**: the CSP's `img-src` is built from this same variable, so pointing it at `img.fototecalapelada.com.ar` moves the header with it and there is no second place to remember. What is left is the DNS record, the R2 custom domain, and turning the `pub-….r2.dev` URL off -- while it is on there are two public ways to every rendition and only one is in the CSP.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | T14, at the platform                                          |
| F17     | Framework JavaScript ships on gallery pages that have almost none of its own: measured at 137 KB in T6, with 164 KB on the home, +27 KB of Swiper for the deck | It is the cost that decides the Next-versus-Astro trade. The figure was not re-measured after the header and footer work, which added one small client component (`MenuDismiss`) and removed nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | see _Next.js vs Astro_                                        |
| F18     | `experimental.inlineCss` is an experimental flag, and it inlines the CSS twice: once as `<style>`, once inside the RSC flight payload                          | It removes a render-blocking round trip, which at 562 ms RTT is most of the first paint. The second copy costs 6.3 KB gzip of the home's 25.8 KB, and a round trip is still dearer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | when it stabilises                                            |
| F19     | Every public read goes through `unstable_cache`, which Next 16 documents as replaced by the `use cache` directive                                              | `use cache` arrives with Cache Components, which changes how the whole app renders; it is a migration, not a swap of one call. The tags and `revalidateTag` carry over unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | when the panel lands (T11)                                    |
| F20     | The gallery's reading order is column-wise, not left to right                                                                                                  | Inherent to CSS multi-column, and the same property the Europeana reference has. Recovering left-to-right order **and** tight packing needs JavaScript or `grid-template-rows: masonry`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | when one of those is available                                |
| F21     | Cells no longer vary in width: a panorama takes the same room as a portrait                                                                                    | Same cause as F19. The height of each copy still carries the variety                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | with F19                                                      |
| F22     | `theme-color` is `#26292c`, the logo's charcoal, while the page ground is `#1B1917`                                                                            | From the favicon design pass. On Android the address bar ends a shade cooler than the header, a visible seam. `background_color` in the manifest is correctly `#26292c`, since that is the icon's own ground                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | one line in the `viewport` export, if the seam bothers anyone |
| F23     | `brand/logo.png` is a 288 px raster, and the F inside it is 43×52                                                                                              | Everything derived from it upscales: the 512 icon is soft, and a crisp large mark is impossible. A vector or a high-resolution scan from the authors would fix it at the source                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | when the authors have one                                     |
| ~~F24~~ | ~~Nothing links `/sobre`, and the archive's contact procedure lives only in the footer~~                                                                       | **Closed in T14, by deciding the footer is the answer.** A page nothing linked was never going to carry a promise that has to reach everybody, and the footer reaches every page. What is left of it is F49, which is one sentence in a field the panel already edits, not a page.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | T14                                                           |
| F25     | Touch targets in the gallery's pagination are 16–19 px, under WCAG 2.2 SC 2.5.8's 24 px                                                                        | Found while sizing the photo page's own controls, which now clear it. Changing T6's shipped pagination was not this card's scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | whoever revisits the gallery                                  |
| ~~F26~~ | ~~The original/restored switch has never run against a real restoration~~                                                                                      | No photograph has one: `restored_web_key` is null for all 592. The markup and its CSS were verified against the shipped stylesheet, the query path was not — attaching a fixture row to the database was not permitted. **Closed in T10**: a restoration was attached through the panel and the page rendered the A/B pair against it, then it was removed again                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | done                                                          |
| F27     | There is no "show sensitive images unblurred" preference                                                                                                       | ARCHITECTURE describes one kept in `localStorage`; the card scoped the per-page card, and a researcher clicking twelve times is not yet a complaint                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | unassigned                                                    |
| ~~F28~~ | ~~The restored copy is rendered at the original's dimensions~~                                                                                                 | The schema has no `restored_web_width`/`height`. True while a restoration is a re-render of the same scan, which is what T10 will produce. **Closed in T10's review pass**: the panel accepts arbitrary uploads, so the assumption stopped holding the moment restorations became real — a restoration whose master differs in width had its `srcSet` built from the photograph's, asking R2 for files that were never encoded. `restored_web_width`/`restored_web_height`, migration `0004`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | done                                                          |
| ~~F29~~ | ~~An unpublished photograph's page answers 404, and _Exposure_ asks for 410~~                                                                                  | `/foto/[slug]` sets `dynamicParams = false`, so a slug outside `generateStaticParams` never reaches the page and cannot choose its status code. T10 needs either `dynamicParams = true` with an explicit published check, or a route handler ahead of it. **Closed in T10 by a third way, because neither of those two exists**: no page in Next 16 can choose its status code, so `dynamicParams = true` still only reaches 404, and a `route.ts` cannot sit at the same path as a `page.tsx`. `src/proxy.ts` is the one place in the framework that can put an arbitrary status on a URL, and it answers the 410                                                                                                                                                                                                                                                                                                                                                                                                               | done                                                          |
| F30     | `text-*` utilities do nothing on a `.t-credit` element                                                                                                         | Measured, not guessed: `.t-credit` is unlayered author CSS and Tailwind 4's utilities sit in `@layer utilities`, which loses whatever the specificity. T6 and T7 pair the two all over, and every one of those renders accent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | whoever revisits the T6 palette                               |
| ~~F31~~ | ~~Search has no rate limiting, and neither do the panel's writes~~                                                                                             | **Closed in T14**: a fixed-window counter in `src/lib/rate-limit.ts` -- 30 searches a minute per address, answered 429 from the proxy, and 60 writes a minute per administrator in `outcome()`, the one function every panel write already passes through. It counts per instance, which is the stated ceiling: the way out is a shared store, and a KV account is a dependency and a variable to lose for an archive whose search reaches a query cache before it reaches Neon.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | T14                                                           |
| F32     | A submitted form leaves the empty filters in the address: `?q=x&seccion=y&decada=&credito=`                                                                    | How an HTML GET form works, and the fix is script or a redirect. A redirect costs a round trip on every search, which at 562 ms RTT is the one thing this design spends its budget avoiding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | when the page runs script anyway                              |
| ~~F33~~ | ~~Search reads the Spanish translation row only~~                                                                                                              | `SEARCH_CONFIG` was `es_unaccent` and the join was pinned to `es`. **Closed in T13**, and it was not one constant and one join condition: the configuration follows the language on both sides of the query, the vector falls back to Spanish, and that fallback needs `nullif(…, ''::tsvector)` because the trigger writes an _empty_ vector for a row with no caption rather than a null one. Without it a language goes silently unsearchable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | done                                                          |
| ~~F34~~ | ~~The panel can answer 500 on the first request after Neon suspends its compute~~                                                                              | **Closed in T9, and the diagnosis in this row was wrong.** Not a cold start: Node 22 gives each address a host resolves to 250 ms to complete its handshake, and Neon's `us-east-2` pooler measures 208-311 ms from Argentina, so the default sits inside the jitter. 7 failures in 12 connections before, 0 in 12 after raising it, in `src/db/connect.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | done                                                          |
| F35     | A takedown leaves the photograph's master reachable in R2                                                                                                      | By design the master survives, and the design assumed it survives in Drive. Today it is in the same public bucket as the derivatives, under the `masters/` prefix, with a random key nothing has ever linked. Still not code: the bucket serves images directly, which is the free-egress design a gallery depends on. T14 wrote down the mechanism -- an edge rule on the custom domain that blocks `/masters/` -- in _Production_ in ARCHITECTURE, and it needs the custom domain first.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | T14, at the platform, with F16                                |
| F36     | The panel cannot move a photograph between sections                                                                                                            | The N:N relation is in the model and _What can be changed_ promises it, but T10's card scopes the fields, the flags, publishing, reordering and the restoration. T11 is where categories are managed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | T11                                                           |
| F37     | After a takedown the photograph's page can keep serving for about two seconds                                                                                  | The proxy memoizes the takedown list rather than asking the database on every photograph view, which would undo the decision that keeps Neon out of the request path. Measured: the derivatives are unreachable the moment the panel answers, and the page serves its stale pre-rendered copy for `MEMO_MS` plus one request -- about 1.9 s of 200, then 404, then 410 at ~2.7 s. The opposite direction, a republished photograph still answering 410, is closed: the proxy confirms the list before it says 410                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | when there is a store the panel writes and the proxy reads    |
| ~~F38~~ | ~~`npm run search:smoke` fails before it runs a single check~~                                                                                                 | It imports `@/db`, and the `server-only` guard F8 added in T9 throws the moment a plain `tsx` process loads it. Not introduced by T10 — verified by stashing the branch and running it on `main`. **Closed here**: the marker package resolves to an empty module under the `react-server` export condition, which is what the App Router sets and a CLI does not, so the npm script passes `--conditions=react-server` and the tool says it is the server. 74 checks pass. The alternative was threading a client through `search.ts` for one test                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | done                                                          |
| F39     | An imported photograph with no derivatives yet has nothing to preview on its edit screen                                                                       | It cannot happen today: the import always generates derivatives, so the preview falls back to the web copy. It becomes visible the first time somebody unpublishes an imported photograph, and closing it means proxying a Drive thumbnail through a route of our own — a new public endpoint for a preview                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | T13+, or whoever asks                                         |
| F40     | A restoration still cannot be imported from Drive                                                                                                              | `restored_drive_file_id` has existed since T2 and nothing writes it: T10 attaches a restoration by upload, and T12 imports photographs. A restoration is retouching somebody did by hand, so it arrives as a file rather than as a folder to sweep. `restored_drive_file_id` has no unique index either, for the same reason — nothing mints one                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Whoever needs it                                              |
| F41     | Two administrators importing into the same section at the same second collide on the slug                                                                      | The unique index on `photo.slug` refuses the second, so nothing is lost: it costs one retry, and the next click imports it. A sequence per section is the way out. Marked in the code as a `ponytail:` comment on `nextPhotoSlug`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Nobody until it happens                                       |
| ~~F42~~ | ~~A translation written straight into Postgres can take a day to appear~~                                                                                      | The public reads are `unstable_cache` with a day's floor, invalidated by `revalidateTag(GALLERY_TAG)` — which the panel calls on every write and a `psql` session does not. **Closed in T15, and by construction rather than by remembering**: every one of the four screens that now writes a translation goes through `outcome()`, which is the one function in the repository that calls `revalidateTag`, so there is no way to add a translation write that forgets. Measured against `next start` rather than reasoned about, in both directions: an `insert` straight into the database left `/en/foto/espacios-001` serving Spanish through five requests over five seconds, and the same caption saved from the panel was live on the **fourth** request, about three seconds later. Not instantaneous, and it was never going to be — `revalidateTag(tag, 'max')` serves the old page while the new one renders behind it, which is the profile T10 chose on purpose. From a day to seconds is the whole of the finding | done                                                          |
| F43     | The 410 page is in Spanish in all four languages                                                                                                               | `gonePage()` in `proxy.ts` is a self-contained document with no database and no message files behind it, deliberately — the page's own chrome is three reads away. Localizing it means either four sentences duplicated in the proxy or loading a message file on every public request, and it is the one page nobody is meant to reach. Its `lang="es"` is at least honest                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | whoever minds                                                 |
| F44     | Switching language with no `Referer` lands on that language's home page                                                                                        | The picker is four links and the proxy reads the page from the `Referer`, because a layout cannot know its own path and the only server-side way to read one is a header — which would make all 592 pre-rendered photo pages dynamic. A pasted `/idioma/en`, a privacy extension or a `noreferrer` context all degrade to the home page rather than breaking. Closing it means the pathname in the URL (`/idioma/en?from=…`), which is a second address per page for a control in a dropdown                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | nobody until somebody notices                                 |
| ~~F45~~ | ~~The panel can say what is untranslated but not translate it~~                                                                                                | `/admin/translations` was read-only: T13's card scoped it to "a panel view of what is untranslated per language". **Closed in T15**: a queue per language at `/admin/translations/[locale]`, and the same boxes on the photograph, section and site-text screens — inside the form each of those already had, so one Guardar saves the Spanish and the three languages in one transaction. It is **one writer with four callers** rather than four write paths, which is what keeps the `NOT NULL` rules on `category_translation.name` and `site_text.value` in one place. The dashboard is now the index of the work: every count links into the queue filtered to exactly what it counts                                                                                                                                                                                                                                                                                                                                      | done                                                          |
| F46     | A 404 renders with no root layout: no `lang`, no stylesheet                                                                                                    | Two root layouts are what let `<html lang>` be true per language, and they leave Next's default not-found boundary above the public site's only `<html>` — `[locale]` is a real segment rather than a route group, so no boundary is inserted inside it. `src/app/[locale]/not-found.tsx` recovers the copy and its language but not the document. Next's docs name exactly these two conditions as the reason `experimental.globalNotFound` exists, and `app/global-not-found.tsx` must return a full HTML document — which would also have no locale, since it runs before rendering. So the choices are a second experimental flag, a Spanish-only styled 404, or the current localized-but-unstyled one                                                                                                                                                                                                                                                                                                                      | whoever minds, or T14 with the rest of the polish             |
| F47     | `npm run auth:smoke` has been failing on `main` since the panel screens got titles                                                                             | Not a regression and not a security defect: `tools/auth-smoke.ts:235` asserts that an anonymous `GET /admin/import` sends none of the screen, and `7e7c03f` gave that page the title `Importar desde Drive` -- which Next flushes in the head before `requireAdmin()`'s `redirect()` fires, so the string the assertion forbids is now in the 307's body. Checked against the production build: still 307 to `/admin/signin`, and the body carries the title and nothing else -- no folder names, no file list, no photo data. The assertion needs a marker that only appears in the rendered body. It aborts the run at step 10, so everything after it has not executed in a while                                                                                                                                                                                                                                                                                                                                             | Whoever touches the panel next                                |
| F48     | On a cold instance the first request for a taken-down photograph can answer 404 instead of 410                                                                 | Seen while verifying T14: the proxy's blocking first read of `/api/gone` hit the 1.5 s timeout on a genuinely cold `next start` and failed open, which is the direction T10 chose on purpose -- failing closed would 410 the whole archive. Every request after it answered 410 in all four languages. It matters more on Vercel than it did on a laptop, because a quiet archive means most requests arrive at a cold instance. Raising the timeout trades it for a slower first paint on the photo page; the real way out is the same shared store F31 names                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Whoever minds; it is one constant                             |
| F49     | The footer shows the contact address but does not say that corrections and takedowns go to it                                                                  | The residue of dropping `/sobre` in T14, and deliberately not code: the sentence belongs in `site_text.rights_notice`, which the panel edits without a deploy, so it is the authors' wording rather than the maintainer's. _Exposure, indexing and takedown on request_ promises the archive invites these requests, and until the sentence exists the invitation is an email address in a footer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Lautaro and Marcos, in the panel                              |
| F50     | `updateTag()` would let the panel see its own writes at once, and `revalidateTag(tag, 'max')` does not                                                         | Found in the Next 16.3.3 docs while building T15: `revalidateTag` with a stale-while-revalidate profile deliberately does **not** re-render inside the action -- "the page reflects the change on a later read" -- and `updateTag`, which only works in a Server Action, makes the next request wait for fresh data instead. Measured here as three requests and about three seconds between saving a caption and seeing it. Not changed in T15, because `'max'` over `GALLERY_TAG` is a cross-cutting decision with its own paragraph in ARCHITECTURE (_Revalidation after a write takes two profiles_), it governs all eleven of the panel's actions, and its reason -- serving the old page beats regenerating against a reader's request -- still holds. What `updateTag` would buy is read-your-own-writes for the two editors, which is exactly what the panel's links to the public site exist for                                                                                                                        | whoever revisits `outcome()`                                  |
| F51     | Saving a page of the translation queue leaves a `photo_translation` row for pieces nobody touched                                                              | **Found and fixed inside T15**, and recorded because the fix is one `if` and the defect was invisible: a page posts all 24 of its boxes, so the upsert wrote an empty row per piece somebody scrolled past -- 24 rows from a save where one field had been filled in, and some 1,500 over the archive. Nothing broke, since the progress screen counts non-empty fields and the public read has `nullif` in front of every `coalesce` for exactly this shape. An empty box now updates and never inserts, which is a no-op on a row that does not exist. It was caught by counting rows after the browser pass, not by reading the code, and `npm run db:smoke` asserts it now                                                                                                                                                                                                                                                                                                                                                   | done                                                          |
| F52     | The queue does not group the 118 captions that are word-for-word duplicates                                                                                    | 519 captions are only 401 distinct strings, so three photographs can carry the same sentence. Indexing the proposals by source text already means each is _translated_ once and the reviewer meets the same proposal pre-filled in all three; what is left is 118 extra clicks. Grouping them means a form field whose identity is a list of slugs rather than one, which is a worse trade until somebody is annoyed. Marked as a `ponytail:` comment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | when the clicks are the complaint                             |
