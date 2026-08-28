#!/usr/bin/env python3
"""Rescue the Fototeca La Pelada photographic archive from Google Sites.

Per section, and preserving the original curatorial order, it extracts:
  - the image at the highest resolution Google keeps (`=s0`)
  - the caption, the credit ("Cortesía: ...") and the source notes

What shapes the download loop is that the `sitesv/` tokens embedded in a page
go stale: a token that served an image at t+0 answered 403 at t+61s on a page
left idle. Downloading a section straight after reading its page, on the other
hand, tripped nothing — 592 images in a row, not one 403. So that is the order
of work, and a 403 re-reads the page for fresh tokens before assuming the
throttle everyone warns about.

Usage:
    python3 tools/extract-sites.py                   # metadata + images
    python3 tools/extract-sites.py --metadata-only   # no downloads
    python3 tools/extract-sites.py --self-check      # parser asserts, no network
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
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "archive"
BASE = "https://sites.google.com/view/fototecalapelada"
CDN = "https://lh3.googleusercontent.com/"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"

PAUSE = 0.6      # seconds between image downloads
BACKOFF = 120    # seconds to wait after a 403, doubled on every round
ROUNDS = 5       # backoff rounds before a section is given up

# The original site menu: the tour its authors chose. Titles are content, so
# they stay in Spanish; the slugs are the live site's own paths.
SECTIONS = [
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

# The home page holds no archive photos: its only non-theme images are the
# Facebook, Instagram and YouTube icons. It is read for its text, which is the
# "Sobre el Proyecto" notice and the description of the town.
TEXT_ONLY = {"principal"}

# Google Sites chrome, not archive text. The live site serves it in English,
# but which language Sites picks is not ours to control, so both are listed.
UI = {
    "skip to main content", "skip to navigation", "search this site", "more",
    "embedded files", "report abuse", "page details", "page updated",
    "back to site", "show sidebar", "open search bar", "copy heading link",
    "clear search", "site actions", "toggle", "google sites", "map",
    "saltar al contenido principal", "saltar a la navegación", "fototeca la pelada",
    "más", "buscar", "página actualizada", "denunciar abuso",
    "volver al sitio web", "mostrar barra lateral", "abrir barra de búsqueda",
    "copiar el vínculo del encabezado", "archivos insertados", "borrar la búsqueda",
    "busca en este sitio web", "acciones del sitio web", "mostrar/ocultar",
}
UI |= {title.lower() for _, title in SECTIONS}

RE_CREDIT = re.compile(r"^cortes[ií]a\s*[:.]?\s*", re.I)
RE_TOKEN = re.compile(r"sitesv/[A-Za-z0-9_-]{40,}")
RE_SPACES = re.compile(r"\s+")
# A historical photo's year: 1850-2029, without catching street numbers.
RE_YEAR = re.compile(r"\b(18[5-9]\d|19\d{2}|20[0-2]\d)\b")
# The site-wide footer. Without this the last photo of every section swallows it.
RE_FOOTER = re.compile(r"^autores del proyecto", re.I)


class RateLimited(Exception):
    """The CDN answered 403: try fresh tokens, and only then wait."""


class SiteReader(HTMLParser):
    """Emits the document flow as ('img' | 'text' | 'video', value) events."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stream: list[tuple[str, str]] = []
        self._skip = 0
        self._buffer: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self._skip += 1
            return
        a = dict(attrs)
        if tag == "img":
            src = a.get("src", "")
            if CDN in src and (m := RE_TOKEN.search(src)):
                # w1280 = gallery photo; w16383 = the theme's banner/logo
                if "=w16383" not in src:
                    self._flush()
                    self.stream.append(("img", m.group(0)))
        elif tag == "iframe":
            src = a.get("src", "")
            if "youtube.com/embed/" in src:
                self._flush()
                self.stream.append(("video", src.split("/embed/")[1].split("?")[0]))
        elif tag in ("p", "div", "br", "h1", "h2", "h3", "h4", "li", "td"):
            self._flush()

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript"):
            self._skip = max(0, self._skip - 1)
        elif tag in ("p", "div", "h1", "h2", "h3", "h4", "li", "td"):
            self._flush()

    def handle_data(self, data):
        if not self._skip:
            self._buffer.append(data)

    def _flush(self) -> None:
        text = RE_SPACES.sub(" ", "".join(self._buffer)).strip()
        self._buffer.clear()
        if len(text) < 3:
            return
        if text.lower() in UI:
            return
        self.stream.append(("text", text))

    def finish(self) -> list[tuple[str, str]]:
        self._flush()
        return self.stream


def fetch(url: str, tries: int = 4) -> bytes:
    last: Exception | None = None
    for n in range(tries):
        try:
            with urlopen(Request(url, headers={"User-Agent": UA}), timeout=45) as r:
                return r.read()
        except HTTPError as e:
            if e.code == 403:
                raise RateLimited(url) from e
            last = e
            time.sleep(1.5 * (n + 1))
        except Exception as e:  # unstable network: retry with a growing wait
            last = e
            time.sleep(1.5 * (n + 1))
    raise RuntimeError(f"could not fetch {url[:80]}: {last}")


def image_size(b: bytes) -> tuple[int, int, str]:
    """Width, height and the real extension, read from the bytes themselves.

    A few of the photos on the site are PNGs, and an archive must not mislabel
    its own files. JPEG dimensions come from the SOF marker, with no dependency.
    """
    if b[:8] == b"\x89PNG\r\n\x1a\n":
        return int.from_bytes(b[16:20], "big"), int.from_bytes(b[20:24], "big"), "png"
    if b[:2] != b"\xff\xd8":
        return 0, 0, "bin"
    i = 2
    while i < len(b) - 9:
        if b[i] != 0xFF:
            i += 1
            continue
        marker = b[i + 1]
        if marker in (0xC0, 0xC1, 0xC2, 0xC3):
            height = int.from_bytes(b[i + 5:i + 7], "big")
            width = int.from_bytes(b[i + 7:i + 9], "big")
            return width, height, "jpg"
        if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        i += 2 + int.from_bytes(b[i + 2:i + 4], "big")
    return 0, 0, "jpg"


def classify(texts: list[str]) -> dict:
    """Split the text block that follows a photo into its parts."""
    caption: list[str] = []
    notes: list[str] = []
    credit = ""
    for t in texts:
        if RE_CREDIT.match(t):
            value = RE_CREDIT.sub("", t).strip(" .")
            # "Sin data" is how the site marks an unknown credit
            credit = "" if value.lower().startswith("sin data") else value
        elif t.lstrip().startswith(("*", "(")):
            notes.append(t.lstrip("* ").strip())
        else:
            caption.append(t)
    return {"caption": " ".join(caption).strip(), "credit": credit, "notes": notes}


def years_in(text: str) -> list[int]:
    return sorted({int(y) for y in RE_YEAR.findall(text)})


def slugify(s: str) -> str:
    plain = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9-]+", "-", plain.lower()).strip("-")


def clean_intro(texts: list[str]) -> str:
    """Keeps the introduction the authors wrote, without the labels."""
    useful = [t for t in texts if len(t) > 40]
    return "\n\n".join(dict.fromkeys(useful))


def fold(stream: list[tuple[str, str]]) -> tuple[list[str], list[dict], list[str]]:
    """Fold the document flow into (intro texts, photos, videos).

    Text belongs to the photo above it, which is the whole convention this
    archive was written with. Two things end that: a video, whose blurb is not a
    caption, and the site-wide footer, which otherwise lands in the last photo
    of every section.
    """
    intro: list[str] = []
    photos: list[dict] = []
    videos: list[str] = []
    block: list[str] | None = None  # text accumulated for the current photo

    for kind, value in stream:
        if kind == "img":
            block = []
            photos.append({"token": value, "texts": block})
        elif kind == "video":
            block = None
            if value not in videos:
                videos.append(value)
        elif RE_FOOTER.match(value):
            break
        elif block is not None:
            block.append(value)
        else:
            intro.append(value)
    return intro, photos, videos


def read_section(slug: str, title: str, position: int) -> dict:
    reader = SiteReader()
    reader.feed(fetch(f"{BASE}/{quote(slug)}").decode("utf-8", "replace"))
    intro, raw, videos = fold(reader.finish())

    name = slugify(slug)
    photos: list[dict] = []
    for n, item in enumerate([] if name in TEXT_ONLY else raw, 1):
        parts = classify(item["texts"])
        years = years_in(" ".join([parts["caption"], *parts["notes"]]))
        photos.append({
            "slug": f"{name}-{n:03d}",
            "position": n,
            "section": name,
            **parts,
            "year_from": years[0] if years else None,
            "year_to": years[-1] if years else None,
            "file": f"{name}/{name}-{n:03d}.jpg",
            "_token": item["token"],
        })

    return {
        "slug": name,
        "title": title,
        "position": position,
        "source_path": slug,
        "intro": clean_intro(intro),
        "videos": videos,
        "photos": photos,
    }


def stamp(photo: dict, data: bytes) -> None:
    """Record what actually landed on disk, extension included."""
    photo["width"], photo["height"], ext = image_size(data)
    photo["file"] = f"{photo['file'].rsplit('.', 1)[0]}.{ext}"
    photo["bytes"] = len(data)
    photo["sha256"] = hashlib.sha256(data).hexdigest()


def refresh_tokens(section: dict) -> bool:
    """Re-read the page for fresh image tokens, matched by document order."""
    fresh = read_section(section["source_path"], section["title"], section["position"])
    if len(fresh["photos"]) != len(section["photos"]):
        print(f"    the page changed ({len(fresh['photos'])} photos now), giving up",
              file=sys.stderr, flush=True)
        return False
    for photo, new in zip(section["photos"], fresh["photos"]):
        photo["_token"] = new["_token"]
    return True


def download_section(section: dict, pause: float) -> list[str]:
    """Download a section's images, paced. Returns the slugs it could not get.

    Two failure modes, told apart by whether re-reading the page fixes it: a
    stale token, which is the one actually observed, and the rate limit everyone
    warns about, which never showed up over 592 downloads. So a 403 refreshes
    the tokens and carries on, and only a 403 that survives a refresh gets the
    long wait. Document order is what ties a photo to its token, so a refresh
    refuses to continue if the photo count moved.
    """
    folder = OUT / "originals" / section["slug"]
    folder.mkdir(parents=True, exist_ok=True)
    pending = list(section["photos"])
    wait, stalled = BACKOFF, 0
    while pending and stalled < ROUNDS:
        before = len(pending)
        for photo in list(pending):
            on_disk = next((f for f in folder.glob(photo["slug"] + ".*") if f.stat().st_size), None)
            if on_disk:
                stamp(photo, on_disk.read_bytes())  # resume
                pending.remove(photo)
                continue
            try:
                data = fetch(f"{CDN}{photo['_token']}=s0", tries=2)
            except RateLimited:
                break
            stamp(photo, data)  # sets the extension, so write after stamping
            (OUT / "originals" / photo["file"]).write_bytes(data)
            pending.remove(photo)
            time.sleep(pause)
        if not pending:
            return []
        if len(pending) == before:  # fresh tokens did not help: this is the throttle
            stalled += 1
            print(f"    403 on fresh tokens, waiting {wait}s ({len(pending)} left)", flush=True)
            time.sleep(wait)
            wait *= 2
        else:
            print(f"    tokens expired, re-reading the page ({len(pending)} left)", flush=True)
        try:
            if not refresh_tokens(section):
                break
        except (RateLimited, RuntimeError) as e:
            print(f"    could not refresh the tokens: {e}", file=sys.stderr, flush=True)
            break
    return [p["slug"] for p in pending]


FIXTURE = """
<h1>Fototeca La Pelada</h1><p>Buscar</p>
<p>Introducción:</p>
<div><p>Un recorrido por los rincones que le dan identidad a La Pelada y su gente.</p></div>
<img src="https://lh3.googleusercontent.com/sitesv/{t}=w16383" aria-label="Site home">
<img src="https://lh3.googleusercontent.com/sitesv/{t}=w1280">
<p>Esquina de la plaza en 1947, con el almacén de ramos generales.</p>
<p>Cortesía: Familia Tesolín</p>
<p>* Libro del Centenario, pág. 44.</p>
<script>var x = function(){ return 1 };</script>
<iframe src="https://www.youtube.com/embed/ABC123xyz?rel=0"></iframe>
<p>MEMORIAS DE LA PELADA - entrevista a una vecina.</p>
<p>Autores del proyecto: Lautaro Tesolín y Marcos Tesolín.</p>
<p>Correo de contacto: fototecalp@gmail.com</p>
<p>Report abuse</p>
""".replace("{t}", "A" * 60)


def self_check() -> int:
    reader = SiteReader()
    reader.feed(FIXTURE)
    stream = reader.finish()
    kinds = [k for k, _ in stream]
    assert kinds.count("img") == 1, stream          # the site logo is excluded
    assert ("video", "ABC123xyz") in stream, stream
    texts = [v for k, v in stream if k == "text"]
    assert not any("function" in t for t in texts), texts   # <script> content dropped
    assert "Report abuse" not in texts, texts                # Sites chrome dropped

    intro, photos, videos = fold(stream)
    assert len(photos) == 1, photos
    assert videos == ["ABC123xyz"], videos
    parts = classify(photos[0]["texts"])
    assert parts["caption"] == "Esquina de la plaza en 1947, con el almacén de ramos generales.", parts
    assert parts["credit"] == "Familia Tesolín", parts
    assert parts["notes"] == ["Libro del Centenario, pág. 44."], parts
    assert years_in(parts["caption"]) == [1947], parts
    assert classify(["Cortesía: Sin data"])["credit"] == "", "unknown credit is empty"
    # the interview blurb and the footer must not end up in the last caption
    assert "MEMORIAS" not in parts["caption"], parts
    assert "fototecalp" not in parts["caption"], parts
    # the label is dropped, the paragraph kept, and the interview blurb becomes
    # section context instead of the caption of whatever photo came before it
    assert clean_intro(intro).startswith("Un recorrido por los rincones"), intro
    assert clean_intro(intro).endswith("entrevista a una vecina."), intro

    sof = b"\xff\xd8\xff\xc0\x00\x11\x08" + (480).to_bytes(2, "big") + (640).to_bytes(2, "big")
    assert image_size(sof + b"\x00" * 10) == (640, 480, "jpg"), image_size(sof)
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 8 + (300).to_bytes(4, "big") + (200).to_bytes(4, "big")
    assert image_size(png) == (300, 200, "png"), image_size(png)
    assert image_size(b"not an image") == (0, 0, "bin")
    assert slugify("inundación-78") == "inundacion-78"
    assert slugify("Educación") == "educacion"
    print("self-check ok")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--metadata-only", action="store_true", help="skip the image downloads")
    ap.add_argument("--pause", type=float, default=PAUSE, help="seconds between downloads")
    ap.add_argument("--self-check", action="store_true", help="run the parser asserts and exit")
    args = ap.parse_args()
    if args.self_check:
        return self_check()

    OUT.mkdir(parents=True, exist_ok=True)
    sections: list[dict] = []
    failed: list[str] = []
    for position, (slug, title) in enumerate(SECTIONS, 1):
        section = read_section(slug, title, position)
        line = f"  {title:<16} {len(section['photos']):>4} photos"
        if section["videos"]:
            line += f"  + {len(section['videos'])} video(s)"
        print(line, flush=True)
        # Downloading right here, while the tokens are still valid.
        if not args.metadata_only:
            missing = download_section(section, args.pause)
            print(f"    {len(section['photos']) - len(missing)}/{len(section['photos'])} downloaded",
                  flush=True)
            failed += missing
        sections.append(section)

    for section in sections:
        for photo in section["photos"]:
            photo.pop("_token", None)

    total = sum(len(s["photos"]) for s in sections)
    output = OUT / "archive.json"
    output.write_text(json.dumps({
        "project": "Fototeca La Pelada",
        "source": BASE,
        "extracted_at": time.strftime("%Y-%m-%d"),
        "resolution_note": "What Google Sites serves at =s0: 300-2340 px wide, re-encoded by "
                           "Sites on upload. Replace with the original scans when they exist.",
        "total_photos": total,
        "sections": sections,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"\n{total} photos in {output.relative_to(ROOT)}")
    without_caption = [p["slug"] for s in sections for p in s["photos"] if not p["caption"]]
    unmeasured = [p["slug"] for s in sections for p in s["photos"] if p.get("width") == 0]
    if without_caption:
        print(f"  WITHOUT A CAPTION: {len(without_caption)} -> {', '.join(without_caption[:12])}")
    if unmeasured:
        print(f"  dimensions unread: {len(unmeasured)} -> {', '.join(unmeasured[:12])}")
    for slug in failed:
        print(f"  FAILED {slug}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
