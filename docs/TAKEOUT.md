# The Takeout route, and why it is closed

The design in [ARCHITECTURE.md](./ARCHITECTURE.md#rescuing-the-current-archive) carried an
assumption: that Google Takeout would export the site to HTML plus images, and that this was the
reason to hold the archive's Gmail credentials. **T1 checked, and it is not true.**

## What was checked, 2026-08-28

The product list at [takeout.google.com](https://takeout.google.com), signed in as the archive's
account, was read item by item. It runs from "Actividad del registro de acceso" to "YouTube y
YouTube Music" and **contains no Sites entry**. Drive is there; Sites is not. The Sites API is no
help either: it only ever reached Classic Sites, and it is deprecated.

So there is no supported way to get the site out of Google as a document, and the "once every two
months" quota this document used to warn about protects nothing. **The scraper is not the fallback,
it is the route.**

## The export that was made instead

The attempt produced `takeout-20260828T130632Z-1-001.zip`, 188 MB, 660 entries, all of it under
`Takeout/Drive/Fototeca` — the brothers' working folder, with no HTML anywhere in it: 649 images in
folders named after the families who lent the photos (Dandolo 74, Teresita 72, Marilu 46,
Tesolin 37, …), their caption notes as `.txt` files, and a handful of Gemini-generated images that
are not archive material.

It was worth having, because it answers the resolution question from the other side. Comparing
those 649 images against the 592 the scraper rescued:

| Measurement                                             | Result |
| ------------------------------------------------------- | ------ |
| Drive images with the exact pixel dimensions of a photo | 497    |
| …byte-identical to it                                   | 4      |
| …same dimensions, larger file (a better encode)         | 210    |
| …same dimensions, smaller file                          | 283    |

Sites re-encodes on upload, and Drive holds a slightly better _encode_ of the same pixels for about
a third of the archive. That is worth nothing in practice: T3 re-encodes every master to AVIF and
WebP anyway, and the pixel dimensions — the only part that would show on screen — are identical.

The `.txt` files are the interesting find. They are the notes the captions were written from, and
some of them may cover the 73 photos the site publishes with a credit and no caption. That is work
for the panel once T10 exists, by hand, not for the extractor.

## If someone tries again anyway

One thing was not tried: a **Drive** export with _all_ files included rather than one folder. A new
Sites site is itself a Drive file, so an export of everything might carry it in some form. Untested,
and worth knowing that it buys, at best, the per-section HTML needed for the reconcile rule in
ARCHITECTURE — which in turn buys a JPEG quality difference the AVIF re-encode erases.

**The recommendation is to leave it.** `archive/originals/` holds the scraped `=s0` copies as the
masters and `archive/archive.json` records each one's width, height, byte size and SHA-256, so any
future comparison is a matter of comparing numbers. The upgrade path that actually improves the
archive is the one the data model was built for: a genuine re-scan at higher resolution, imported
through T12 with `master_source = 'drive'`.
