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
| T15 | `t15-translations`       | T13        |

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

### T7 — Photo detail page

`/foto/[slug]`: image, caption, credit, notes, years, categories, previous/next, the warning card
ahead of the image, the A/B original/restored switch, Open Graph metadata (excluding the image when
sensitive), `noimageindex` where applicable.

_Acceptance_: a direct link in a new window shows the warning before the image; the WhatsApp
preview of a sensitive photo does not show it; pinch zoom works.
_Commit_: `feat(public): add photo detail page with warnings and restoration toggle`

### T8 — Search and filters

Postgres full-text search with `unaccent`, filters by decade, credit and category, all
server-rendered with shareable URLs and CDN caching.

_Acceptance_: "Tesolin" finds "Tesolín" and "educacion" finds "Educación"; filters work without
JavaScript; results have their own URL.
_Commit_: `feat(public): add server-rendered full-text search with filters`

### T9 — Auth and admin shell

Auth.js v5 with Google, email allowlist in the database, admin layout with Spanish strings.

_Acceptance_: an account outside the allowlist is rejected; authorization is checked on the server
on every endpoint, not only in the UI.
_Commit_: `feat(admin): add Google authentication and admin shell`

### T10 — Admin: photos

Edit caption, credit, years, place and notes; flag as sensitive and as featured; publish and
unpublish (**deleting the R2 derivatives**); reorder; attach a restoration.

_Acceptance_: unpublishing leaves the detail page at 410 and the R2 URL unreachable; republishing
regenerates the derivatives.
_Commit_: `feat(admin): add photo editing, publishing and restoration management`

### T11 — Admin: categories and home

Category CRUD with order and visibility, cover-photo selection, and a **Home** view showing how the
home page will look: sections in order and the featured photos.

_Acceptance_: creating a category makes its public route appear with no deploy; hiding it removes it
from navigation without deleting its photos; reordering in the Home view changes the home page
order.
_Commit_: `feat(admin): add category management and home organization`

### T12 — Admin: Drive import

Drive service account, folder selection, master download, derivative generation through T3, record
creation with `drive_file_id`.

_Acceptance_: importing a test folder creates records with their derivatives in R2 and the correct
`drive_file_id`; re-importing does not duplicate.
_Commit_: `feat(admin): add Google Drive import for preservation masters`

### T13 — Public i18n

`next-intl` over the `/[locale]` routes, fallback to Spanish when a translation is missing, and a
panel view of what is untranslated per language. **The panel itself is not translated.**

_Acceptance_: `/en/foto/espacios-001` shows the English caption when it exists and the Spanish one
when it does not; correct `hreflang`; the panel stays in Spanish.
_Commit_: `feat(i18n): add locale routing and translation fallback for the public site`

### T14 — Deploy and hardening

Vercel connected to GitHub, environment variables, the `fototecalapelada.com.ar` and
`img.fototecalapelada.com.ar` domains, CSP and security headers, rate limiting, sitemap, Search
Console, and a notice on the old Sites site.

Secret scanning needs no setup: the repository is public, so GitHub push protection is free and on
by default. Verify it in Settings → Code security rather than configuring it.

_Acceptance_: no secrets in the client bundle (verified by grepping the generated files); security
headers respond; the sitemap lists only published photos.
_Commit_: `chore: configure production deployment, domains and security headers`

### T15 — Translations

Loading the English, French and Italian translations. Human work, no new code.

_Commit_: `content: add English, French and Italian translations`

---

## Follow-ups

Things found while executing the board and deliberately left. Each one says why it was left and
who it belongs to, so nothing here is quietly waiting on a decision nobody knows about. Shortcuts
_inside_ code are marked differently, with a `ponytail:` comment naming the ceiling and the way
out: `grep -rn "ponytail:" src tools` lists those.

| ID     | What                                                                                                                                                           | Why it was left                                                                                                                                                                                                     | Belongs to                                                    |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| F1     | 73 of the 592 photos have no caption on the live site, only a credit                                                                                           | The source's own state, not a loss in transit. The Drive folder's `Explicacion.txt` and `fotos.txt` are candidate material                                                                                          | T10, by hand                                                  |
| F2     | `campo-067`'s caption still ends with "A CONTINUACIÓN, FOTOGRAFÍAS DE 'CARNEADAS'…"                                                                            | The warning is `photo.sensitive` now, so the sentence is stale — but trimming an author's words is not a script's call                                                                                              | T10                                                           |
| F3     | The 12 photos flagged sensitive were derived from that one marker, and 3 of them have no caption                                                               | Worth one look from Lautaro and Marcos before the site is public                                                                                                                                                    | T10                                                           |
| F4     | `photo.source` and `photo.place` are empty for all 592                                                                                                         | The scraper cannot separate a book reference from any other note, and place lives inside the captions as prose                                                                                                      | T10, or never                                                 |
| F5     | The three YouTube interviews in `archive.json` have no home in the data model                                                                                  | One video in three sections is not a schema, and nothing in the design consumes them yet                                                                                                                            | T6, if they should show                                       |
| ~~F6~~ | ~~The home page text rescued in T1 is in `archive.json` but not in the database~~                                                                              | **Closed in T6**: `site_text` carries it, plus the town description and the map that the extractor never saw                                                                                                        | done                                                          |
| F7     | No index on `photo.published` or `photo.featured`                                                                                                              | At 592 rows Postgres sequential-scans regardless                                                                                                                                                                    | when a plan asks for it                                       |
| F8     | The database client carries no `server-only` guard                                                                                                             | Not resolvable in Next 16; it would be a new dependency for one line, and the env var already fails safe                                                                                                            | T9                                                            |
| F9     | `npm audit` reports 4 moderate, all esbuild ≤ 0.24.2 through `drizzle-kit`                                                                                     | Dev-only, and `audit fix --force` downgrades drizzle-kit by thirteen minor versions                                                                                                                                 | when drizzle-kit moves                                        |
| F10    | A takedown is verified through `HeadObject`, not through a public URL                                                                                          | `img.fototecalapelada.com.ar` does not exist yet                                                                                                                                                                    | T14                                                           |
| F11    | AVIF and WebP quality sit at 50 and 78 and were never tuned                                                                                                    | They look right on real photos from this archive and the bytes are already small                                                                                                                                    | nobody, probably                                              |
| F12    | A Drive export including every file was never tried, in case it carries the Sites HTML                                                                         | The measured gain is a JPEG encode that the AVIF re-encode erases                                                                                                                                                   | see TAKEOUT.md                                                |
| F13    | `/sobre` and `/creditos` appear in the repository layout but no card builds them                                                                               | T6 covered the layout, the home page and the galleries, which is what its card scoped. T6 also removed the only link to `/sobre`, so nothing 404s now — and nothing reaches the contact procedure except the footer | unassigned                                                    |
| F14    | The home page has no highlights strip                                                                                                                          | No photo is `featured` yet, so the strip would be untestable dead code                                                                                                                                              | T11                                                           |
| F15    | Public routes sit at the root, not under `/[locale]`                                                                                                           | A locale segment with no i18n behind it is fake structure; next-intl restructures these routes anyway                                                                                                               | T13                                                           |
| F16    | `NEXT_PUBLIC_IMAGE_BASE_URL` points at R2's development URL (`pub-….r2.dev`)                                                                                   | The custom image domain does not exist yet. The dev URL exposes the bucket at a public address and should be turned off                                                                                             | T14                                                           |
| F17    | Framework JavaScript ships on gallery pages that have almost none of its own: measured at 137 KB in T6, with 164 KB on the home, +27 KB of Swiper for the deck | It is the cost that decides the Next-versus-Astro trade. The figure was not re-measured after the header and footer work, which added one small client component (`MenuDismiss`) and removed nothing                | see _Next.js vs Astro_                                        |
| F18    | `experimental.inlineCss` is an experimental flag, and it inlines the CSS twice: once as `<style>`, once inside the RSC flight payload                          | It removes a render-blocking round trip, which at 562 ms RTT is most of the first paint. The second copy costs 6.3 KB gzip of the home's 25.8 KB, and a round trip is still dearer                                  | when it stabilises                                            |
| F19    | Every public read goes through `unstable_cache`, which Next 16 documents as replaced by the `use cache` directive                                              | `use cache` arrives with Cache Components, which changes how the whole app renders; it is a migration, not a swap of one call. The tags and `revalidateTag` carry over unchanged                                    | when the panel lands (T11)                                    |
| F20    | The gallery's reading order is column-wise, not left to right                                                                                                  | Inherent to CSS multi-column, and the same property the Europeana reference has. Recovering left-to-right order **and** tight packing needs JavaScript or `grid-template-rows: masonry`                             | when one of those is available                                |
| F21    | Cells no longer vary in width: a panorama takes the same room as a portrait                                                                                    | Same cause as F19. The height of each copy still carries the variety                                                                                                                                                | with F19                                                      |
| F22    | `theme-color` is `#26292c`, the logo's charcoal, while the page ground is `#1B1917`                                                                            | From the favicon design pass. On Android the address bar ends a shade cooler than the header, a visible seam. `background_color` in the manifest is correctly `#26292c`, since that is the icon's own ground        | one line in the `viewport` export, if the seam bothers anyone |
| F23    | `brand/logo.png` is a 288 px raster, and the F inside it is 43×52                                                                                              | Everything derived from it upscales: the 512 icon is soft, and a crisp large mark is impossible. A vector or a high-resolution scan from the authors would fix it at the source                                     | when the authors have one                                     |
| F24    | Nothing links `/sobre`, and the archive's contact procedure lives only in the footer                                                                           | The header entry came out when the sections became a menu. The takedown procedure that _Exposure_ promises has no page yet                                                                                          | with F13                                                      |
