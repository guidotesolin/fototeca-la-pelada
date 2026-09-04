# Fototeca La Pelada

[![CI](https://github.com/guidotesolin/fototeca-la-pelada/actions/workflows/ci.yml/badge.svg)](https://github.com/guidotesolin/fototeca-la-pelada/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

The digital photographic archive of La Pelada, a small town in Santa Fe, Argentina: **592 historical
photographs**, each with its caption and the family that lent it, searchable, shareable and
administered by the two history teachers who built the collection — without touching code.

**Live at [fototecalapelada.com.ar](https://fototecalapelada.com.ar/)** · Versión en español:
[README.es.md](README.es.md)

[![The home page: a fanned carousel of section covers over a dark background](docs/screenshots/home-desktop.jpg)](https://fototecalapelada.com.ar/)

Non-profit project. Archive authors: Lautaro and Marcos Tesolín — fototecalp@gmail.com

## What it does

The archive used to live on Google Sites, where nothing had its own URL, nothing could be searched,
and every caption was loose text under an image. This application replaces it with:

- **A permalink per photograph** and per section, indexable and citable, with Open Graph cards.
- **Full-text search and filters** across captions, credits and sections, in Postgres, per language.
- **Four languages** — Spanish, English, French and Italian — for the descendants of the town's
  migrant families abroad. Translations live in the database and fall back to Spanish in SQL.
- **An admin panel in Spanish**, behind Google sign-in, where the authors edit captions, reorder
  sections, translate, import scans from Google Drive and take a photograph off the site.
- **A takedown path that deletes nothing**: an unpublished photograph answers `410 Gone` within
  seconds, and comes back with one click.

Mobile first: a 24-photo gallery scores 98 on Lighthouse's mobile profile, LCP 2.3 s, CLS 0.

## How it is built

Next.js 16 (App Router, React Server Components) · TypeScript · Tailwind CSS 4 · Postgres on Neon
with Drizzle · Cloudflare R2 · Auth.js v5 · next-intl · sharp · Vercel.

The decisions that shaped it, each argued in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md):

- **Two homes for every image.** Google Drive is the preservation vault for the full-resolution
  masters and never serves a byte. R2 holds only the derivatives the site consumes, encoded with
  `sharp` at import time. Drive blocks hotlinking and its terms forbid use as a CDN; R2 has free
  egress, and a gallery is pure egress.
- **The public site is fully pre-rendered**, including the sitemap, and revalidated by cache tag on
  every panel write. Localization is server-side only: no message file reaches the browser.
- **Two gates on the panel, and they are different.** Google says who you are; a row in `app_user`
  says whether you get in. The session is a JWT, but every panel request re-reads that table, so
  removal takes effect on the next request.
- **Postgres keeps the promises.** Re-importing a Drive folder is a no-op because `drive_file_id`
  carries a partial unique index, not because the application remembers. A shared folder is
  untrusted input: image type is read from the bytes, never from the extension.
- **No secrets in the repository, enforced.** A dependency-free pre-commit hook blocks `.env*` files
  and runs `gitleaks`; nothing prefixed `NEXT_PUBLIC_` may be a secret.
- **Verification against the real thing.** Thirteen `*:smoke` scripts check the schema, the image
  pipeline, search, i18n, rate limiting, the takedown and the Drive import against live services,
  because the failures that matter here are integration failures.

## Documentation

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — the design and its reasoning. Read this first.
- **[docs/TASKS.md](docs/TASKS.md)** — the task board, one branch per task, with acceptance criteria.
- **[docs/TAKEOUT.md](docs/TAKEOUT.md)** — what the Google Takeout export did and did not contain.
- **[docs/TRANSLATION.md](docs/TRANSLATION.md)** — how the four languages are produced and loaded.

## Getting started

Requires Node.js 22+. `gitleaks` is optional but recommended:
https://github.com/gitleaks/gitleaks/releases

```bash
npm install
cp .env.example .env.local   # fill in real values
npm run db:migrate           # creates the schema on the database in DATABASE_URL
npm run dev
```

`.env.local` is gitignored, and the pre-commit hook refuses to commit any `.env*` file.

<details>
<summary><strong>Troubleshooting local setup</strong> — exFAT partitions, IPv6 timeouts</summary>

> ### This project cannot live on exFAT
>
> The first attempt was on `/mnt/Datos` (exFAT) and it failed: exFAT **does not support symlinks**,
> which npm needs for `node_modules/.bin`, and that partition is additionally mounted `noexec` with
> `fmask=0177`. No flag fixes it. That is why the project lives in `~/Proyectos`, on ext4.

> ### If a database or R2 call hangs and then times out
>
> Neon and Cloudflare publish AAAA records. On a machine with no default IPv6 route, Node tries
> IPv6 first and the connection dies with `AggregateError [ETIMEDOUT]` at `internalConnectMultiple`
> instead of falling back. Check with `ip -6 route show default`: if it prints nothing, run the
> scripts with
>
> ```bash
> export NODE_OPTIONS="--no-network-family-autoselection --dns-result-order=ipv4first"
> ```
>
> It is a local network condition, not a project setting, which is why it is not baked into the
> npm scripts. Vercel is unaffected.

</details>

## Scripts

| Command                  | What it does                                |
| ------------------------ | ------------------------------------------- |
| `npm run dev`            | Development server                          |
| `npm run build`          | Production build                            |
| `npm run lint`           | ESLint                                      |
| `npm run format`         | Prettier across the repo                    |
| `npm run format:check`   | Verify formatting without writing           |
| `npm run db:generate`    | Generate a migration from the schema        |
| `npm run db:migrate`     | Apply pending migrations                    |
| `npm run db:smoke`       | Check the schema against a live database    |
| `npm run images:smoke`   | Check the derivative pipeline and R2        |
| `npm run url:smoke`      | Check the URL guards on `site_text`         |
| `npm run search:smoke`   | Check search against a live database        |
| `npm run i18n:smoke`     | Check the message files and locale routing  |
| `npm run takedown:smoke` | Check the takedown against the real bucket  |
| `npm run drive:smoke`    | Check the Drive import and the master reads |
| `npm run home:smoke`     | Check T11's acceptance (app running)        |
| `npm run auth:smoke`     | Check the panel's boundary (app running)    |
| `npm run admin:add`      | Put an email address on the allowlist       |
| `npm run admin:list`     | Show who can enter the panel                |
| `npm run admin:remove`   | Take an email address off the allowlist     |

## Development workflow

- `main` holds the skeleton. Every task branches off it: `t1-rescue-archive`, `t2-db-schema`, etc.
  Each card in `docs/TASKS.md` states scope, dependencies and acceptance criteria.
- **AI-assisted, human-reviewed.** Each task was executed with Claude Code in an independent session
  that reads `docs/ARCHITECTURE.md` and its card and nothing else. Claude does not commit: it
  proposes the commit message and the ticket description, and the maintainer reviews every diff and
  runs the commit.
- Code is written with the `ponytail` plugin: YAGNI, stdlib before dependency, the shortest diff
  that works. Deliberate shortcuts carry a `ponytail:` comment with their ceiling and way out.
- Code, identifiers, commits and documentation in English. The admin panel is in Spanish, never
  translated.
- CI runs lint, Prettier, the migrations and a production build against an empty Postgres on every
  push and pull request.

## Admin panel access

The panel lives at `/admin`, signs in with Google and is in Spanish. Two things gate it, and they
are different: Google says **who you are**, and a row in `app_user` says **whether you get in**.
There is no role column — everyone on that list is an administrator.

**The Google OAuth client**, once per environment, at
[console.cloud.google.com](https://console.cloud.google.com) → **Google Auth Platform**. Google
reorganised this in 2025: what used to be one "OAuth consent screen" wizard is now four sections in
the left nav, and scopes are no longer part of creating the app.

1. _Branding_: app name `Fototeca La Pelada`, support and contact email `fototecalp@gmail.com`.
2. _Audience_: **External**, left in **Testing**, with the four archive accounts added as test
   users. Internal is not an option: it requires the project to belong to a Google Cloud
   organization, and these are personal Gmail accounts. Testing is the closest equivalent — only a
   listed test user can even reach the consent screen, which puts a second gate in front of the
   database allowlist. Its usual cost does not apply here: authorizations in Testing expire after
   seven days **except** for apps requesting only basic profile scopes over OIDC, which is this one,
   and Auth.js's Google provider never asks for `access_type: offline`, so no refresh token is
   issued at all. The price is the "Google hasn't verified this app" screen, once per account.
3. _Data access_: nothing to add. Sign-in uses `openid`, `email` and `profile`, the three Auth.js
   asks for by default over OIDC, and they need no declaration. If a consent screen ever refuses
   them, add the three there and nowhere else. Drive is **not** requested: T12 reads it through a
   service account instead.
4. _Clients_ → Create client → Application type **Web application**.
5. Authorized JavaScript origins: `http://localhost:3000` for development,
   `https://fototecalapelada.com.ar` for production.
6. Authorized redirect URIs — the path is Auth.js's and must match exactly:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://fototecalapelada.com.ar/api/auth/callback/google`
7. The client ID and secret become `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`. Generate
   `AUTH_SECRET` with `openssl rand -base64 32`, different in development and production.

**The first administrator** cannot be added from the panel, because nobody can enter a panel whose
allowlist is empty. Seed it from the command line:

```bash
npm run admin:add -- someone@gmail.com "Name Surname"
npm run admin:list
```

Removal takes effect on the offending account's **next request**: the session cookie is a JWT and
stays cryptographically valid, but every panel request re-reads `app_user`.

```bash
npm run admin:remove -- someone@gmail.com
```

## Importing from Drive

Drive is the preservation vault: it holds the masters at full resolution and never serves a byte to
a reader. R2 holds only the derivatives the site consumes. **Nothing copies a master to R2** — 600
high-resolution scans do not fit in R2's free 10 GB, and Drive's own terms forbid using it as a
CDN. The row keeps `drive_file_id`, and `readMaster()` in `src/lib/derivatives.ts` is the one door
to a master's bytes, from either place.

### The service account, once

Reading Drive unattended needs a **service account**, not the brothers' OAuth token: it does not
expire, it is read-only, and it sees exactly the one folder shared with its address. All of this is
by hand, once, at [console.cloud.google.com](https://console.cloud.google.com) — use the same
project as the OAuth client above.

1. **Enable the API.** _APIs & Services_ → _Library_ → search **Google Drive API** → **Enable**.
   Nothing here is billable at this volume: an import is occasional, never traffic.
2. **Create the account.** _IAM & Admin_ → _Service Accounts_ → **Create service account**. Name it
   something like `fototeca-drive-reader`; the id becomes its address,
   `fototeca-drive-reader@<project>.iam.gserviceaccount.com`. **Copy that address**, step 5 needs
   it. Skip both optional steps: it needs **no project role** — its only permission comes from the
   folder being shared with it — and no user access.
3. **Download the key.** Open the account → _Keys_ → **Add key** → **Create new key** → **JSON**.
   The browser downloads it once and Google keeps no copy.
4. **Turn it into the variable.** The JSON **never enters the repository** — it travels as base64
   and is decoded in memory:

   ```bash
   base64 -w0 ~/Downloads/<project>-<hash>.json
   ```

   That single line is `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`, in `.env.local` locally and in the
   Vercel dashboard in production. Then delete the downloaded file — the variable is the only copy
   that should exist, and a `.json` key sitting in `~/Downloads` is a credential nobody is
   watching.

   **Write it straight to the file rather than copying it out of the terminal.** It is one
   unbroken line of about 3,200 characters, and a terminal copy is where it loses its tail — which
   still decodes, into a JSON object stopping in the middle of a field, so the failure does not
   look like a truncated paste:

   ```bash
   sed -i '/^GOOGLE_SERVICE_ACCOUNT_JSON_BASE64=/d' .env.local
   printf 'GOOGLE_SERVICE_ACCOUNT_JSON_BASE64=%s\n' "$(base64 -w0 ~/Downloads/<key>.json)" >> .env.local
   ```

5. **Share the folder, as a reader.** In Drive, open the masters folder → **Share** → paste the
   service account's address → role **Viewer** → Send. It is not a person, so there is nothing to
   accept; access is live immediately. Viewer and never Editor: this side of the application has no
   business writing to the vault.
6. **The folder id** is the last path segment of its URL —
   `https://drive.google.com/drive/folders/`**`1AbC...`** — and it is
   `GOOGLE_DRIVE_MASTERS_FOLDER_ID`.

Check it before opening the panel:

```bash
npm run drive:smoke
```

It lists the folder, the folders inside it and how many images each holds. Until the two variables
are set it says so and runs its other checks anyway.

### Importing

**Panel → Importar desde Drive.** Pick a folder — the masters folder or one of the
folders inside it — and the **section** the photographs belong to. The section decides two things:
which gallery they appear in, and their identifier, which follows the archive's own convention
(`espacios-071`, the next free number). **Drive filenames are not used**: they carry spaces,
accents and repeats, and a permalink has to be stable.

Then **Importar todas**, which runs by itself until the folder is done, or **Importar una** for one
at a time. Either way **one photograph per request**, because a master download plus six encodes
plus six uploads is seconds each and a whole folder in one request does not finish inside the
function's 60-second limit. The screen can be closed at any moment: what is left to do is worked
out from the database every time it renders, so a run resumes where it stopped.

**Re-importing a folder does nothing**, and that promise is Postgres's rather than the
application's: `drive_file_id` carries a partial unique index, so a second row for the same file is
refused by the database even if two people press the button at the same second.

Each photograph arrives **published**, at the end of its section, with no caption and no credit —
which is the state 73 of the original 592 are in. Those get written in **Fotografías**, where the
"Sin epígrafe" filter lists exactly them. To hold one back from the site until it is ready,
**Despublicar** on its own screen.

What is checked on the way in, because a shared folder is untrusted input: the real image type is
read **from the bytes** with `sharp` and never from the extension or from the `mimeType` Drive
reported, anything sharp cannot decode is refused, and the download stops at 40 MB as the bytes
arrive rather than after. What is recorded is `master_source = 'drive'`, the `drive_file_id`, the
SHA-256 and the real pixel dimensions.

A file that fails those checks **stops the run**: the next request takes the same first pending file
and refuses it again. That is deliberate — skipping it would mean remembering which files failed,
which is the queue this design does without, and a scan nothing can decode deserves a look rather
than a silent skip. The message says so and the list on screen is anchored on that file. Take it out
of the Drive folder and press the button again.

## Hiding a photograph

**The archive never deletes anything.** Once an image is in, it is in: the only thing the panel can
do is take it off the site.

1. **Panel → Editar fotos**, find it (the search box takes a caption, a "Cortesía" or the
   identifier), open it and press **Despublicar**.
2. Its page takes **a couple of seconds** to catch up: for about two more it still shows the copy
   the site had already built, then it answers **410 Gone**. If you check the instant you press the
   button you will see the old page, and that is the cache turning over, not a failure. It leaves
   the galleries and the search in the same few seconds.
3. **Nothing is deleted and nothing is lost.** The image files, the masters and every word of the
   research stay exactly where they are, which is why **Publicar** puts it back instantly instead of
   rebuilding it.
4. **The image file itself keeps answering at its own address.** Nothing on the site links it any
   more and the address cannot be guessed, but somebody who wrote it down before still has it. So
   this hides a photograph; it does not erase it from the internet.
5. **Google keeps its own copy for a while.** The 410 is what tells it to drop the page, and it
   obeys on its next crawl. To hurry it, use the removal tool in Search Console
   (<https://search.google.com/search-console/removals>) on the photograph's URL. That step is done
   by hand and needs nobody from the outside.

If a neighbour asks for their photograph to be **removed** rather than hidden, steps 1 and 5 are as
far as the panel goes today, and step 4 is the part to be honest with them about. Actually revoking
the file means changing the bucket's configuration in Cloudflare, which is not something the panel
can do — see _Exposure, indexing and takedown on request_ in `docs/ARCHITECTURE.md`.

## Security

No secret enters the repository. Variables go in `.env.local` (development) or the Vercel dashboard
(production). **Nothing prefixed `NEXT_PUBLIC_` may be a secret**: that prefix permanently inlines
the value into the client bundle.

The hook in `.githooks/pre-commit` (wired through git's native `core.hooksPath`, no dependencies)
blocks `.env*` files and runs `gitleaks` when it is installed.
