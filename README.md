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

| Comando                  | Qué hace                                                       |
| ------------------------ | -------------------------------------------------------------- |
| `npm run dev`            | Servidor de desarrollo                                         |
| `npm run build`          | Build de producción                                            |
| `npm run lint`           | ESLint                                                         |
| `npm run format`         | Prettier sobre todo el repo                                    |
| `npm run format:check`   | Verifica formato sin escribir                                  |
| `npm run db:generate`    | Genera una migración desde el esquema                          |
| `npm run db:migrate`     | Aplica las migraciones pendientes                              |
| `npm run db:smoke`       | Verifica el esquema contra una base real                       |
| `npm run images:smoke`   | Verifica el pipeline de derivados y R2                         |
| `npm run url:smoke`      | Guards de URL de `site_text`                                   |
| `npm run search:smoke`   | Verifica la búsqueda en una base real                          |
| `npm run i18n:smoke`     | Verifica los archivos de mensajes y las URLs por idioma        |
| `npm run takedown:smoke` | Verifica la baja de fotos contra el bucket real                |
| `npm run drive:smoke`    | Verifica la importación desde Drive y la lectura de originales |
| `npm run home:smoke`     | Verifica portada, secciones y textos (app viva)                |
| `npm run auth:smoke`     | Verifica el límite del panel (app viva)                        |
| `npm run admin:add`      | Agrega un correo a la lista blanca                             |
| `npm run admin:list`     | Muestra quién puede entrar al panel                            |
| `npm run admin:remove`   | Saca un correo de la lista blanca                              |

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

## Importar desde Drive

Drive es la bóveda de preservación: guarda los originales en máxima resolución y no le sirve ni un
byte a quien visita el sitio. R2 guarda solamente las copias que el sitio consume. **Nada copia un
original a R2** — 600 escaneos en alta resolución no entran en los 10 GB gratis de R2, y los
términos de Drive prohíben usarlo como CDN. La ficha guarda el `drive_file_id`, y `readMaster()` en
`src/lib/derivatives.ts` es la única puerta a los bytes de un original, esté donde esté.

### La cuenta de servicio, una sola vez

Para leer Drive sin que nadie esté presente hace falta una **cuenta de servicio**, no el token de
OAuth de los hermanos: no vence, es de sólo lectura y ve exactamente la carpeta que se le compartió.
Todo esto es a mano, una vez, en [console.cloud.google.com](https://console.cloud.google.com), en el
mismo proyecto que el cliente de OAuth de más arriba.

1. **Habilitar la API.** _APIs y servicios_ → _Biblioteca_ → buscar **Google Drive API** →
   **Habilitar**. A este volumen no se factura nada: importar es algo ocasional, nunca tráfico.
2. **Crear la cuenta.** _IAM y administración_ → _Cuentas de servicio_ → **Crear cuenta de
   servicio**. Un nombre tipo `fototeca-drive-reader`; el id se convierte en su dirección,
   `fototeca-drive-reader@<proyecto>.iam.gserviceaccount.com`. **Copiar esa dirección**, el paso 5
   la necesita. Los dos pasos opcionales se saltean: **no necesita ningún rol** en el proyecto — su
   único permiso viene de la carpeta compartida — ni acceso de usuarios.
3. **Bajar la clave.** Abrir la cuenta → _Claves_ → **Agregar clave** → **Crear clave nueva** →
   **JSON**. El navegador la baja una sola vez y Google no se queda con copia.
4. **Convertirla en la variable.** El JSON **no entra nunca al repositorio**: viaja en base64 y se
   decodifica en memoria.

   ```bash
   base64 -w0 ~/Descargas/<proyecto>-<hash>.json
   ```

   Esa única línea es `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`, en `.env.local` en local y en el panel
   de Vercel en producción. Después, borrar el archivo descargado: la variable tiene que ser la
   única copia que exista, y una clave `.json` en `~/Descargas` es una credencial que nadie está
   mirando.

   **Escribirla directo al archivo en vez de copiarla de la terminal.** Es una sola línea de unos
   3.200 caracteres, y copiarla desde la terminal es donde pierde la cola — que igual decodifica,
   en un JSON que se corta en la mitad de un campo, así que el error no parece un pegado
   incompleto:

   ```bash
   sed -i '/^GOOGLE_SERVICE_ACCOUNT_JSON_BASE64=/d' .env.local
   printf 'GOOGLE_SERVICE_ACCOUNT_JSON_BASE64=%s\n' "$(base64 -w0 ~/Descargas/<clave>.json)" >> .env.local
   ```

5. **Compartir la carpeta, como lectora.** En Drive, abrir la carpeta de originales → **Compartir**
   → pegar la dirección de la cuenta de servicio → rol **Lector** → Enviar. No es una persona, así
   que no hay nada que aceptar: el acceso queda activo en el momento. Lector y nunca Editor: esta
   parte de la aplicación no tiene por qué escribir en la bóveda.
6. **El id de la carpeta** es el último tramo de su URL —
   `https://drive.google.com/drive/folders/`**`1AbC...`** — y es `GOOGLE_DRIVE_MASTERS_FOLDER_ID`.

Se verifica antes de abrir el panel:

```bash
npm run drive:smoke
```

Lista la carpeta, las carpetas que tiene adentro y cuántas imágenes hay en cada una. Mientras las
dos variables no estén puestas lo dice, y corre igual el resto de sus verificaciones.

### Importar

**Panel → Importar desde Drive.** Se elige una carpeta — la de originales o una de las
que tiene adentro — y la **sección** a la que pertenecen las fotografías. La sección decide dos
cosas: en qué galería aparecen y cuál es su identificador, que sigue la convención del archivo
(`espacios-071`, el próximo número libre). **Los nombres de archivo de Drive no se usan**: traen
espacios, acentos y repetidos, y un permalink tiene que ser estable.

Después, **Importar todas**, que sigue sola hasta terminar la carpeta, o **Importar una** de a una.
En los dos casos es **una fotografía por pedido**, porque bajar un original más seis codificaciones
más seis subidas son segundos por fotografía y una carpeta entera en un solo pedido no termina
dentro del límite de 60 segundos de la función. La pantalla se puede cerrar en cualquier momento: lo
que falta se calcula desde la base cada vez que se dibuja, así que una tanda se retoma donde quedó.

**Volver a importar una carpeta no hace nada**, y esa garantía la da Postgres y no la aplicación:
`drive_file_id` tiene un índice único parcial, así que una segunda ficha para el mismo archivo la
rechaza la base incluso si dos personas aprietan el botón en el mismo segundo.

Cada fotografía entra **publicada**, al final de su sección, sin epígrafe y sin cortesía — que es el
estado en el que están 73 de las 592 originales. Esos datos se escriben en **Fotografías**, donde el
filtro «Sin epígrafe» lista justamente esas. Para que una no se vea en el sitio hasta estar lista,
**Despublicar** en su propia ficha.

Qué se verifica al entrar, porque una carpeta compartida es entrada no confiable: el tipo real de la
imagen se lee **de los bytes** con `sharp` y nunca de la extensión ni del `mimeType` que informó
Drive, se rechaza todo lo que sharp no pueda decodificar, y la descarga se corta a los 40 MB
mientras llegan los bytes, no después. Se guarda `master_source = 'drive'`, el `drive_file_id`, el
SHA-256 y las dimensiones reales.

Un archivo que no pasa esas verificaciones **corta la tanda**: el pedido siguiente vuelve a agarrar
la misma primera fotografía pendiente y la vuelve a rechazar. Es a propósito — saltearla significaría
recordar qué archivos fallaron, que es justamente la cola que este diseño evita, y un escaneo que
nada puede decodificar merece que alguien lo mire y no que se lo saltee en silencio. El mensaje lo
dice, y la lista en pantalla queda anclada en ese archivo. Se lo saca de la carpeta de Drive y se
aprieta el botón de nuevo.

## Ocultar una fotografía

**El archivo no borra nunca nada.** Una vez que una imagen entró, entró: lo único que el panel puede
hacer es sacarla del sitio.

1. **Panel → Editar fotos**, buscala (el buscador toma el epígrafe, la "Cortesía" o el
   identificador), abrila y apretá **Despublicar**.
2. La ficha tarda **un par de segundos** en ponerse al día: durante unos dos más sigue mostrando la
   copia que el sitio ya tenía armada, y después responde **410 Gone**. Si mirás en el instante en
   que apretás el botón vas a ver la página vieja, y eso es la caché dándose vuelta, no una falla.
   Sale de las galerías y del buscador en esos mismos segundos.
3. **No se borra ni se pierde nada.** Los archivos de imagen, los masters y todo el trabajo de
   investigación quedan exactamente donde están, y por eso **Publicar** la devuelve al instante en
   vez de rearmarla.
4. **El archivo de imagen sigue respondiendo en su propia dirección.** Ya nada del sitio lo enlaza y
   la dirección no se puede adivinar, pero quien la haya anotado antes la sigue teniendo. Así que
   esto oculta una fotografía; no la borra de internet.
5. **Google se queda un tiempo con su copia.** El 410 es lo que le dice que la saque, y obedece en
   el próximo rastreo. Para apurarlo, usá la herramienta de eliminación de Search Console
   (<https://search.google.com/search-console/removals>) sobre la URL de la fotografía. Ese paso es
   a mano y no necesita a nadie de afuera.

Si un vecino pide que su foto se **borre** y no que se oculte, los pasos 1 y 5 son todo lo que el
panel puede hacer hoy, y el paso 4 es la parte que hay que decirle de frente. Que el archivo deje de
responder de verdad es configuración del bucket en Cloudflare, no algo que el panel pueda cambiar
—ver _Exposure, indexing and takedown on request_ en `docs/ARCHITECTURE.md`.

## Seguridad

Ningún secreto entra al repositorio. Las variables van en `.env.local` (desarrollo) o en el panel
de Vercel (producción). **Nada con prefijo `NEXT_PUBLIC_` puede ser un secreto**: ese prefijo
inlinea el valor en el bundle del cliente de forma permanente.

El hook en `.githooks/pre-commit` (activado con `core.hooksPath`, feature nativa de git, sin
dependencias) bloquea los archivos `.env*` y corre `gitleaks` cuando está instalado.

## Nota para sesiones de Claude

Este proyecto usa **Next 16**, que tiene breaking changes respecto de las versiones que los
modelos conocen. Antes de escribir código de Next, leer `node_modules/next/dist/docs/`.
