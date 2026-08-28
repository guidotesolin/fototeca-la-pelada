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

### T6 — Public galleries

Layout, home page and per-category galleries. Server Components, mobile first, **content readable
without JavaScript**, pagination with real URLs, per-photo `aspect-ratio`, blurring of sensitive
images.

_Acceptance_: navigable with JavaScript disabled; no layout shift; mobile Lighthouse with simulated
3G green on LCP and CLS.
_Commit_: `feat(public): add layout, home and category galleries`

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

Vercel connected to GitLab, environment variables, the `fototecalapelada.com.ar` and
`img.fototecalapelada.com.ar` domains, CSP and security headers, rate limiting, Secret Detection in
CI, sitemap, Search Console, and a notice on the old Sites site.

_Acceptance_: no secrets in the client bundle (verified by grepping the generated files); security
headers respond; the sitemap lists only published photos.
_Commit_: `chore: configure production deployment, domains and security headers`

### T15 — Translations

Loading the English, French and Italian translations. Human work, no new code.

_Commit_: `content: add English, French and Italian translations`
