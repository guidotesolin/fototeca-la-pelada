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

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in real values
npm run db:migrate           # creates the schema on the database in DATABASE_URL
npm run dev
```

`.env.local` is gitignored, and the pre-commit hook refuses to commit any `.env*` file.

## Scripts

| Command                | What it does                             |
| ---------------------- | ---------------------------------------- |
| `npm run dev`          | Development server                       |
| `npm run build`        | Production build                         |
| `npm run lint`         | ESLint                                   |
| `npm run format`       | Prettier across the repo                 |
| `npm run format:check` | Verify formatting without writing        |
| `npm run db:generate`  | Generate a migration from the schema     |
| `npm run db:migrate`   | Apply pending migrations                 |
| `npm run db:smoke`     | Check the schema against a live database |

## Workflow

- `main` holds the skeleton. Every task branches off it: `t1-rescue-archive`, `t2-db-schema`, etc.
- Each task is executed in an independent session that reads `docs/ARCHITECTURE.md` and its card in
  `docs/TASKS.md`.
- **Claude does not commit**: it proposes the commit message in English and the ticket description.
- Code is written with the `ponytail` plugin: YAGNI, stdlib before dependency, the shortest diff
  that works. Deliberate shortcuts carry a `ponytail:` comment with their ceiling and way out.
- Code, identifiers, commits and documentation in English. The admin panel is in Spanish, never
  translated.

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

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # completar con valores reales
npm run db:migrate           # crea el esquema en la base de DATABASE_URL
npm run dev
```

`.env.local` está en `.gitignore` y el hook de pre-commit se niega a commitear cualquier `.env*`.

## Scripts

| Comando                | Qué hace                                 |
| ---------------------- | ---------------------------------------- |
| `npm run dev`          | Servidor de desarrollo                   |
| `npm run build`        | Build de producción                      |
| `npm run lint`         | ESLint                                   |
| `npm run format`       | Prettier sobre todo el repo              |
| `npm run format:check` | Verifica formato sin escribir            |
| `npm run db:generate`  | Genera una migración desde el esquema    |
| `npm run db:migrate`   | Aplica las migraciones pendientes        |
| `npm run db:smoke`     | Verifica el esquema contra una base real |

## Flujo de trabajo

- `main` tiene el esqueleto. Cada tarea sale en su rama: `t1-rescue-archive`, `t2-db-schema`, etc.
- Cada tarea se ejecuta en una sesión independiente que lee `docs/ARCHITECTURE.md` y su ficha en
  `docs/TASKS.md`.
- **Claude no commitea**: propone el mensaje de commit en inglés y la descripción del ticket.
- Se codifica con el plugin `ponytail`: YAGNI, stdlib antes que dependencia, el diff más corto que
  funcione. Los atajos deliberados llevan un comentario `ponytail:` con su techo y su salida.
- Código, identificadores, commits y documentación en inglés. El panel de administración, en
  español sin traducir.

## Seguridad

Ningún secreto entra al repositorio. Las variables van en `.env.local` (desarrollo) o en el panel
de Vercel (producción). **Nada con prefijo `NEXT_PUBLIC_` puede ser un secreto**: ese prefijo
inlinea el valor en el bundle del cliente de forma permanente.

El hook en `.githooks/pre-commit` (activado con `core.hooksPath`, feature nativa de git, sin
dependencias) bloquea los archivos `.env*` y corre `gitleaks` cuando está instalado.

## Nota para sesiones de Claude

Este proyecto usa **Next 16**, que tiene breaking changes respecto de las versiones que los
modelos conocen. Antes de escribir código de Next, leer `node_modules/next/dist/docs/`.
