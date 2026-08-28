#!/usr/bin/env python3
"""
Rescata el archivo fotografico de Fototeca La Pelada desde Google Sites.

Extrae, por seccion y respetando el orden curatorial original:
  - la imagen a la maxima resolucion que Google conserve
  - el epigrafe, el credito ("Cortesia: ...") y las notas de fuente

Uso:
    python3 tools/extraer_sites.py            # extrae todo (metadatos + imagenes)
    python3 tools/extraer_sites.py --solo-metadatos
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
import unicodedata
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "archivo"
BASE = "https://sites.google.com/view/fototecalapelada"
CDN = "https://lh3.googleusercontent.com/"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"

# Orden del menu del sitio original: es el recorrido que eligieron los autores.
SECCIONES = [
    ("principal", "Principal"),
    ("espacios", "Espacios"),
    ("sociales", "Sociales"),
    ("familias", "Familias"),
    ("educación", "Educación"),
    ("deporte", "Deporte"),
    ("trabajo", "Trabajo"),
    ("campo", "Campo"),
    ("eucaliptus", "Eucaliptus"),
    ("religión", "Religión"),
    ("casamientos", "Casamientos"),
    ("inundación-78", "Inundación '78"),
]

# Texto de interfaz de Google Sites, no del archivo.
UI = {
    "saltar al contenido principal", "saltar a la navegación", "fototeca la pelada",
    "más", "buscar", "página actualizada", "denunciar abuso", "google sites",
    "volver al sitio web", "mostrar barra lateral", "abrir barra de búsqueda",
    "copiar el vínculo del encabezado", "archivos insertados", "borrar la búsqueda",
    "busca en este sitio web", "acciones del sitio web", "mostrar/ocultar", "map",
}
UI |= {t.lower() for _, t in SECCIONES}

RE_JS = re.compile(r"function\s*\(|\bvar\s|\}\)|;\s*$|=>|\{\s*return|typeof\s|prototype\.")
RE_CORTESIA = re.compile(r"^cortes[ií]a\s*[:.]?\s*", re.I)
RE_TOKEN = re.compile(r"sitesv/[A-Za-z0-9_-]{40,}")
RE_ESPACIOS = re.compile(r"\s+")
# Un año de foto historica: 1850-2029, evitando capturar numeros de calle.
RE_ANIO = re.compile(r"\b(18[5-9]\d|19\d{2}|20[0-2]\d)\b")


class LectorSitio(HTMLParser):
    """Emite el flujo del documento como eventos ('img'|'texto'|'video', valor)."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.eventos: list[tuple[str, str]] = []
        self._ignorar = 0
        self._buffer: list[str] = []

    # -- bloques a descartar por completo
    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self._ignorar += 1
            return
        a = dict(attrs)
        if tag == "img":
            src = a.get("src", "")
            if CDN in src and (m := RE_TOKEN.search(src)):
                # w1280 = foto de galeria; w16383 = banner/logo del tema
                if "=w16383" not in src:
                    self._volcar()
                    self.eventos.append(("img", m.group(0)))
        elif tag == "iframe":
            src = a.get("src", "")
            if "youtube.com/embed/" in src:
                self._volcar()
                vid = src.split("/embed/")[1].split("?")[0]
                self.eventos.append(("video", vid))
        elif tag in ("p", "div", "br", "h1", "h2", "h3", "h4", "li", "td"):
            self._volcar()

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript"):
            self._ignorar = max(0, self._ignorar - 1)
        elif tag in ("p", "div", "h1", "h2", "h3", "h4", "li", "td"):
            self._volcar()

    def handle_data(self, data):
        if not self._ignorar:
            self._buffer.append(data)

    def _volcar(self) -> None:
        texto = RE_ESPACIOS.sub(" ", "".join(self._buffer)).strip()
        self._buffer.clear()
        if not texto or len(texto) < 3:
            return
        if texto.lower() in UI or RE_JS.search(texto):
            return
        self.eventos.append(("texto", texto))

    def cerrar(self) -> list[tuple[str, str]]:
        self._volcar()
        return self.eventos


def bajar(url: str, intentos: int = 4) -> bytes:
    ultimo: Exception | None = None
    for n in range(intentos):
        try:
            pedido = Request(url, headers={"User-Agent": UA})
            with urlopen(pedido, timeout=45) as r:
                return r.read()
        except Exception as e:  # red inestable: reintentar con espera creciente
            ultimo = e
            time.sleep(1.5 * (n + 1))
    raise RuntimeError(f"no se pudo bajar {url[:80]}: {ultimo}")


def medir_jpeg(b: bytes) -> tuple[int, int]:
    """Ancho y alto de un JPEG leyendo el marcador SOF, sin dependencias."""
    i = 2
    while i < len(b) - 9:
        if b[i] != 0xFF:
            i += 1
            continue
        marca = b[i + 1]
        if marca in (0xC0, 0xC1, 0xC2, 0xC3):
            alto = int.from_bytes(b[i + 5:i + 7], "big")
            ancho = int.from_bytes(b[i + 7:i + 9], "big")
            return ancho, alto
        if marca in (0xD8, 0xD9) or 0xD0 <= marca <= 0xD7:
            i += 2
            continue
        i += 2 + int.from_bytes(b[i + 2:i + 4], "big")
    return 0, 0


def clasificar(textos: list[str]) -> dict:
    """Separa el bloque de texto que sigue a una foto en sus partes."""
    epigrafe: list[str] = []
    notas: list[str] = []
    cortesia = ""
    for t in textos:
        if RE_CORTESIA.match(t):
            valor = RE_CORTESIA.sub("", t).strip(" .")
            # "Sin data" es como el sitio marca credito desconocido
            cortesia = "" if valor.lower().startswith("sin data") else valor
        elif t.lstrip().startswith("*") or t.lstrip().startswith("("):
            notas.append(t.lstrip("* ").strip())
        else:
            epigrafe.append(t)
    return {"epigrafe": " ".join(epigrafe).strip(), "cortesia": cortesia, "notas": notas}


def anios_de(texto: str) -> list[int]:
    return sorted({int(a) for a in RE_ANIO.findall(texto)})


def procesar(slug: str, titulo: str, orden: int) -> dict:
    url = f"{BASE}/{quote(slug)}"
    lector = LectorSitio()
    lector.feed(bajar(url).decode("utf-8", "replace"))
    eventos = lector.cerrar()

    intro: list[str] = []
    fotos: list[dict] = []
    videos: list[str] = []
    pendiente: list[str] | None = None  # textos acumulados para la foto actual

    for tipo, valor in eventos:
        if tipo == "img":
            pendiente = []
            fotos.append({"token": valor, "_textos": pendiente})
        elif tipo == "video":
            if valor not in videos:
                videos.append(valor)
        elif pendiente is not None:
            pendiente.append(valor)
        else:
            intro.append(valor)

    limpias: list[dict] = []
    for n, f in enumerate(fotos, 1):
        datos = clasificar(f.pop("_textos"))
        base = f"{slug_ascii(slug)}-{n:03d}"
        contexto = " ".join([datos["epigrafe"], *datos["notas"]])
        limpias.append({
            "id": base,
            "orden": n,
            "seccion": slug_ascii(slug),
            **datos,
            "anios": anios_de(contexto),
            "archivo": f"{slug_ascii(slug)}/{base}.jpg",
            "restaurada": None,  # se completa cuando exista version restaurada con IA
            "token_origen": f["token"],
        })

    return {
        "slug": slug_ascii(slug),
        "titulo": titulo,
        "orden": orden,
        "ruta_origen": slug,
        "introduccion": depurar_intro(intro),
        "videos": videos,
        "fotos": limpias,
    }


def slug_ascii(s: str) -> str:
    sin = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9-]+", "-", sin.lower()).strip("-")


def depurar_intro(textos: list[str]) -> str:
    """Conserva la introduccion redactada por los autores, sin los rotulos."""
    utiles = [t for t in textos if len(t) > 40 and not t.lower().startswith("introducc")]
    return "\n\n".join(dict.fromkeys(utiles))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--solo-metadatos", action="store_true")
    args = ap.parse_args()

    DESTINO.mkdir(parents=True, exist_ok=True)
    secciones = []
    for i, (slug, titulo) in enumerate(SECCIONES, 1):
        s = procesar(slug, titulo, i)
        secciones.append(s)
        print(f"  {titulo:<16} {len(s['fotos']):>4} fotos"
              f"{'  + ' + str(len(s['videos'])) + ' video(s)' if s['videos'] else ''}",
              flush=True)

    total = sum(len(s["fotos"]) for s in secciones)

    if not args.solo_metadatos:
        print(f"\nDescargando {total} imagenes a maxima resolucion disponible...")
        hechas, fallidas = 0, []
        for s in secciones:
            carpeta = DESTINO / "originales" / s["slug"]
            carpeta.mkdir(parents=True, exist_ok=True)
            for f in s["fotos"]:
                ruta = DESTINO / "originales" / f["archivo"]
                if ruta.exists() and ruta.stat().st_size > 0:
                    datos = ruta.read_bytes()
                else:
                    try:
                        datos = bajar(f"{CDN}{f['token_origen']}=s0")
                    except Exception as e:
                        fallidas.append((f["id"], str(e)[:60]))
                        continue
                    ruta.write_bytes(datos)
                f["ancho"], f["alto"] = medir_jpeg(datos)
                f["bytes"] = len(datos)
                f["sha1"] = hashlib.sha1(datos).hexdigest()[:16]
                hechas += 1
                if hechas % 50 == 0:
                    print(f"    {hechas}/{total}", flush=True)
        print(f"  descargadas: {hechas}/{total}")
        for i, e in fallidas:
            print(f"  FALLO {i}: {e}", file=sys.stderr)

    for s in secciones:
        for f in s["fotos"]:
            f.pop("token_origen", None)

    salida = {
        "proyecto": "Fototeca La Pelada",
        "origen": BASE,
        "nota_resolucion": "Google Sites solo conserva versiones reducidas (470-1750 px de ancho). "
                           "Reemplazar por los escaneos originales cuando esten disponibles.",
        "total_fotos": total,
        "secciones": secciones,
    }
    destino_json = DESTINO / "archivo.json"
    destino_json.write_text(json.dumps(salida, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n{total} fotos en {destino_json.relative_to(RAIZ)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
