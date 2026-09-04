> English version: [README.md](README.md)

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
