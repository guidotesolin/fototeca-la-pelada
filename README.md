# Fototeca La Pelada

Digital photographic archive of La Pelada, Santa Fe, Argentina. A migration from Google Sites to a
purpose-built application: 592 photographs, nearly all with caption and credit, browsable through
search and filters, and administered by their own authors without touching code.

Non-profit project. Archive authors: Lautaro and Marcos Tesolín — fototecalp@gmail.com

## Documentation

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — the design and its reasoning. Read this first.
- **[docs/TASKS.md](docs/TASKS.md)** — the task board, one branch per task.

## Requirements

- Node.js 22+
- An **ext4 or similar** partition. See the warning below.
- `gitleaks` (optional but recommended): https://github.com/gitleaks/gitleaks/releases

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

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in real values
npm run db:migrate           # creates the schema on the database in DATABASE_URL
npm run dev
```

`.env.local` is gitignored, and the pre-commit hook refuses to commit any `.env*` file.

## Scripts

| Command                  | What it does                               |
| ------------------------ | ------------------------------------------ |
| `npm run dev`            | Development server                         |
| `npm run build`          | Production build                           |
| `npm run lint`           | ESLint                                     |
| `npm run format`         | Prettier across the repo                   |
| `npm run format:check`   | Verify formatting without writing          |
| `npm run db:generate`    | Generate a migration from the schema       |
| `npm run db:migrate`     | Apply pending migrations                   |
| `npm run db:smoke`       | Check the schema against a live database   |
| `npm run images:smoke`   | Check the derivative pipeline and R2       |
| `npm run url:smoke`      | Check the URL guards on `site_text`        |
| `npm run search:smoke`   | Check search against a live database       |
| `npm run takedown:smoke` | Check the takedown against the real bucket |
| `npm run home:smoke`     | Check T11's acceptance (app running)       |
| `npm run auth:smoke`     | Check the panel's boundary (app running)   |
| `npm run admin:add`      | Put an email address on the allowlist      |
| `npm run admin:list`     | Show who can enter the panel               |
| `npm run admin:remove`   | Take an email address off the allowlist    |

## Workflow

- `main` holds the skeleton. Every task branches off it: `t1-rescue-archive`, `t2-db-schema`, etc.
- Each task is executed in an independent session that reads `docs/ARCHITECTURE.md` and its card in
  `docs/TASKS.md`.
- **Claude does not commit**: it proposes the commit message in English and the ticket description.
- Code is written with the `ponytail` plugin: YAGNI, stdlib before dependency, the shortest diff
  that works. Deliberate shortcuts carry a `ponytail:` comment with their ceiling and way out.
- Code, identifiers, commits and documentation in English. The admin panel is in Spanish, never
  translated.

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

## Taking a photograph down

When a neighbour asks for their photograph to be removed:

1. **Panel → Fotografías**, find it (the search box takes a caption, a "Cortesía" or the
   identifier), open it and press **Despublicar**.
2. That deletes its web derivatives from R2 — its restoration's too, if it has one — so the image
   stops answering at its URL the moment the panel answers. Its page takes **a couple of seconds**
   to catch up: for about two more it still shows the copy the site had already built, then it
   answers **410 Gone**. If you check the instant you press the button you will see the old page,
   and that is the cache turning over, not a failure. It leaves the galleries and the search in the
   same few seconds.
3. **Nothing is lost.** The masters and every word of the research stay where they are, and
   **Publicar** regenerates the derivatives from them at new addresses. The ones the takedown killed
   never come back.
4. **Google keeps its own copy for a while.** The 410 is what tells it to drop the page, and it
   obeys on its next crawl. To hurry it, use the removal tool in Search Console
   (<https://search.google.com/search-console/removals>) on the photograph's URL. That step is done
   by hand and needs nobody from the outside.

## Security

No secret enters the repository. Variables go in `.env.local` (development) or the Vercel dashboard
(production). **Nothing prefixed `NEXT_PUBLIC_` may be a secret**: that prefix permanently inlines
the value into the client bundle.

The hook in `.githooks/pre-commit` (wired through git's native `core.hooksPath`, no dependencies)
blocks `.env*` files and runs `gitleaks` when it is installed.

## Note for Claude sessions

This project uses **Next 16**, which has breaking changes relative to the versions models were
trained on. Before writing Next code, read `node_modules/next/dist/docs/`.

---

# Versión en Español

Archivo digital fotográfico de La Pelada, Santa Fe, Argentina. Migración del sitio en Google Sites
a una aplicación propia: 592 fotografías, casi todas con epígrafe y crédito, consultables por
búsqueda y filtros, y administrables por sus autores sin tocar código.

Proyecto sin fines de lucro. Autores del archivo: Lautaro y Marcos Tesolín — fototecalp@gmail.com

## Documentación

La documentación técnica está en inglés, por convención del proyecto:

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — el diseño y sus motivos. Leer primero.
- **[docs/TASKS.md](docs/TASKS.md)** — el tablero de tareas, una rama por tarea.

## Requisitos

- Node.js 22+
- Una partición **ext4 o similar**. Ver la advertencia de abajo.
- `gitleaks` (opcional pero recomendado): https://github.com/gitleaks/gitleaks/releases

> ### El proyecto no puede vivir en exFAT
>
> El primer intento fue en `/mnt/Datos` (exFAT) y falló: exFAT **no soporta symlinks**, que npm
> necesita para `node_modules/.bin`, y esa partición además está montada `noexec` con
> `fmask=0177`. Ningún flag lo arregla. Por eso el proyecto vive en `~/Proyectos`, sobre ext4.

> ### Si una llamada a la base o a R2 se cuelga y termina en timeout
>
> Neon y Cloudflare publican registros AAAA. En una máquina sin ruta IPv6 por defecto, Node intenta
> IPv6 primero y la conexión muere con `AggregateError [ETIMEDOUT]` en `internalConnectMultiple` en
> vez de caer a IPv4. Se verifica con `ip -6 route show default`: si no imprime nada, correr los
> scripts con
>
> ```bash
> export NODE_OPTIONS="--no-network-family-autoselection --dns-result-order=ipv4first"
> ```
>
> Es una condición de la red local, no una configuración del proyecto, y por eso no está metida en
> los scripts de npm. Vercel no se ve afectado.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # completar con valores reales
npm run db:migrate           # crea el esquema en la base de DATABASE_URL
npm run dev
```

`.env.local` está en `.gitignore` y el hook de pre-commit se niega a commitear cualquier `.env*`.

## Scripts

| Comando                  | Qué hace                                        |
| ------------------------ | ----------------------------------------------- |
| `npm run dev`            | Servidor de desarrollo                          |
| `npm run build`          | Build de producción                             |
| `npm run lint`           | ESLint                                          |
| `npm run format`         | Prettier sobre todo el repo                     |
| `npm run format:check`   | Verifica formato sin escribir                   |
| `npm run db:generate`    | Genera una migración desde el esquema           |
| `npm run db:migrate`     | Aplica las migraciones pendientes               |
| `npm run db:smoke`       | Verifica el esquema contra una base real        |
| `npm run images:smoke`   | Verifica el pipeline de derivados y R2          |
| `npm run url:smoke`      | Guards de URL de `site_text`                    |
| `npm run search:smoke`   | Verifica la búsqueda en una base real           |
| `npm run takedown:smoke` | Verifica la baja de fotos contra el bucket real |
| `npm run home:smoke`     | Verifica portada, secciones y textos (app viva) |
| `npm run auth:smoke`     | Verifica el límite del panel (app viva)         |
| `npm run admin:add`      | Agrega un correo a la lista blanca              |
| `npm run admin:list`     | Muestra quién puede entrar al panel             |
| `npm run admin:remove`   | Saca un correo de la lista blanca               |

## Flujo de trabajo

- `main` tiene el esqueleto. Cada tarea sale en su rama: `t1-rescue-archive`, `t2-db-schema`, etc.
- Cada tarea se ejecuta en una sesión independiente que lee `docs/ARCHITECTURE.md` y su ficha en
  `docs/TASKS.md`.
- **Claude no commitea**: propone el mensaje de commit en inglés y la descripción del ticket.
- Se codifica con el plugin `ponytail`: YAGNI, stdlib antes que dependencia, el diff más corto que
  funcione. Los atajos deliberados llevan un comentario `ponytail:` con su techo y su salida.
- Código, identificadores, commits y documentación en inglés. El panel de administración, en
  español sin traducir.

## Acceso al panel

El panel vive en `/admin`, entra con Google y está en español. Lo cuidan dos cosas distintas:
Google dice **quién sos**, y una fila en `app_user` dice **si entrás**. No hay columna de rol: todo
el que está en esa lista es administrador.

**El cliente OAuth de Google**, una vez por entorno, en
[console.cloud.google.com](https://console.cloud.google.com) → **Google Auth Platform**. Google lo
reorganizó en 2025: lo que era un solo asistente de "pantalla de consentimiento" ahora son cuatro
secciones de la barra lateral, y los scopes ya no forman parte de crear la app.

1. _Información de la marca_: nombre `Fototeca La Pelada`, correo de asistencia y de contacto
   `fototecalp@gmail.com`.
2. _Público_: **External**, en estado **Testing**, con las cuatro cuentas del archivo cargadas como
   usuarios de prueba. Internal no es una opción: exige que el proyecto pertenezca a una
   organización de Google Cloud, y estas son cuentas de Gmail personales. Testing es lo más parecido
   — solo un usuario de prueba listado llega siquiera a la pantalla de consentimiento, lo que pone
   un segundo cerrojo delante de la lista blanca de la base. Su costo habitual no aplica acá: las
   autorizaciones en Testing vencen a los siete días **salvo** para apps que piden solo scopes
   básicos de perfil por OIDC, que es esta, y el provider de Google de Auth.js nunca pide
   `access_type: offline`, así que no se emite ningún refresh token. El precio es la pantalla de
   "Google no verificó esta app", una vez por cuenta.
3. _Acceso a los datos_: no hay nada que agregar. El login usa `openid`, `email` y `profile`, los
   tres que Auth.js pide por defecto por OIDC, y no necesitan declararse. Si alguna vez una pantalla
   de consentimiento los rechaza, se agregan ahí y en ningún otro lado. Drive **no** se pide: T12 lo
   lee con una cuenta de servicio.
4. _Clientes_ → Crear cliente → Tipo **Aplicación web**.
5. Orígenes de JavaScript autorizados: `http://localhost:3000` en desarrollo,
   `https://fototecalapelada.com.ar` en producción.
6. URIs de redirección autorizados — la ruta es la de Auth.js y tiene que coincidir exacto:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://fototecalapelada.com.ar/api/auth/callback/google`
7. El ID y el secreto van a `AUTH_GOOGLE_ID` y `AUTH_GOOGLE_SECRET`. `AUTH_SECRET` se genera con
   `openssl rand -base64 32`, distinto en desarrollo y en producción.

**El primer administrador** no se puede agregar desde el panel, porque nadie entra a un panel con
la lista blanca vacía. Se siembra desde la línea de comandos:

```bash
npm run admin:add -- alguien@gmail.com "Nombre Apellido"
npm run admin:list
```

Sacar a alguien tiene efecto en su **request siguiente**: la cookie de sesión es un JWT y sigue
siendo válida, pero cada request del panel vuelve a leer `app_user`.

```bash
npm run admin:remove -- alguien@gmail.com
```

## Dar de baja una fotografía

Cuando un vecino pide que saquen su foto:

1. **Panel → Fotografías**, buscala (el buscador toma el epígrafe, la "Cortesía" o el
   identificador), abrila y apretá **Despublicar**.
2. Eso borra sus derivadas de R2 —y las de su restauración, si tiene— así que la imagen deja de
   responder en su URL apenas el panel contesta. La ficha tarda **un par de segundos** en ponerse al
   día: durante unos dos más sigue mostrando la copia que el sitio ya tenía armada, y después
   responde **410 Gone**. Si mirás en el instante en que apretás el botón vas a ver la página vieja,
   y eso es la caché dándose vuelta, no una falla. Sale de las galerías y del buscador en esos
   mismos segundos.
3. **No se pierde nada.** Los masters y todo el trabajo de investigación quedan donde están, y
   **Publicar** regenera las derivadas a partir de ellos, en direcciones nuevas. Las que mató la
   baja no vuelven nunca.
4. **Google se queda un tiempo con su copia.** El 410 es lo que le dice que la saque, y obedece en
   el próximo rastreo. Para apurarlo, usá la herramienta de eliminación de Search Console
   (<https://search.google.com/search-console/removals>) sobre la URL de la fotografía. Ese paso es
   a mano y no necesita a nadie de afuera.

## Seguridad

Ningún secreto entra al repositorio. Las variables van en `.env.local` (desarrollo) o en el panel
de Vercel (producción). **Nada con prefijo `NEXT_PUBLIC_` puede ser un secreto**: ese prefijo
inlinea el valor en el bundle del cliente de forma permanente.

El hook en `.githooks/pre-commit` (activado con `core.hooksPath`, feature nativa de git, sin
dependencias) bloquea los archivos `.env*` y corre `gitleaks` cuando está instalado.

## Nota para sesiones de Claude

Este proyecto usa **Next 16**, que tiene breaking changes respecto de las versiones que los
modelos conocen. Antes de escribir código de Next, leer `node_modules/next/dist/docs/`.
