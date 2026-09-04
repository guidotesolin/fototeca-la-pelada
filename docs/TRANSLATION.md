# Translating the archive

> How the English, French and Italian versions of Fototeca La Pelada are produced,
> and the rules that hold whatever tool produces them. The editor that writes them
> is described in [ARCHITECTURE.md](./ARCHITECTURE.md); the task board is
> [TASKS.md](./TASKS.md). This document is the part that is **archival criteria
> rather than code**, so it is the one to read before a fourth language is added.

## What there is to translate

Measured in the database, not estimated:

| Piece                | Count   | Where it lives               |
| -------------------- | ------- | ---------------------------- |
| Captions             | 519     | `photo_translation.caption`  |
| Source notes         | 12      | `photo_translation.notes`    |
| Section names        | 11      | `category_translation.name`  |
| Section intros       | 10      | `category_translation.intro` |
| The site's own words | 7       | `site_text.value`            |
| **Per language**     | **559** |                              |

**1,677 pieces across the three languages, over 45,524 characters of Spanish.**
The 519 captions are only **401 distinct strings** — 118 are word-for-word
duplicates, 17% of the caption text — which is why proposals are indexed by the
source text rather than by the photograph, and why translating them is 401 jobs
and not 519.

Three counts that are easy to get wrong and are stated here because the screens
depend on them:

- **74 photographs have no caption at all**, which is the source's own state and
  not a loss (F1). They are not translation work.
- **Only 7 of the 12 `site_text` keys are language.** The map embed, the contact
  address and the three social URLs are the same value in four languages;
  `TRANSLATABLE_SITE_TEXT` in `src/app/admin/site-text/fields.ts` is what says so,
  and the editor refuses to write the other five in any language.
- **The credit is never translated.** `photo.credit` is 37 distinct values and
  every one of them is a family: _Anything that is not language is not
  translated_ is the data model's own rule.

## How a translation is produced

1. `npm run translations:export` writes the Spanish out to
   `src/app/admin/translations/proposals/{en,fr,it}.json`, one entry per distinct
   source text, and merges rather than overwriting what is already there.
2. Somebody fills in `proposed` with whatever translator they like. A file is the
   interface precisely so this is not tied to one tool.
3. Either a person reviews each one in the panel, where the proposal appears in
   the box marked **«propuesta automática, sin revisar»** next to the Spanish it
   came from — or `npm run translations:load` writes them all at once.

### What was actually done, and by whom

**Say this plainly, because anybody reading a French caption deserves to know
where it came from.**

The 28 pieces that are not captions — the eleven section names, the ten section
intros and the seven site texts — were translated into **English** by hand in the
panel, by somebody who reads English, before anything else ran.

**Everything else was machine-translated and loaded in bulk, without review piece
by piece.** That was a decision, taken knowingly: 559 pieces per language is 1,677
translations, the alternative was one person reading each of them on a screen, and
the archive chose to publish and correct rather than wait. The glossary below was
applied while translating, and the load reported six glossary warnings per
language — all six known false positives, listed under the traps.

Two consequences worth being direct about:

- **Nobody who reads French or Italian has checked those two languages.** The
  Spanish is the document; those are a serviceable rendering of it.
- **A wrong translation is cheap to fix and hard to notice.** Every piece is one
  link away from an edit box on `/admin/translations`, and clearing a field falls
  back to Spanish rather than leaving a hole. What is missing is somebody looking.

`tools/translations-load.ts` never overwrites a target that already holds text, so
work done by hand survives every re-run — that is how the 28 English pieces above
were kept when 1,649 machine translations went in around them.

## What is not translated

The machine-readable list is `PROTECTED` in
[`src/lib/glossary.ts`](../src/lib/glossary.ts), grouped by class, and **this
document does not repeat it**: two copies of one fact is how one of them goes
stale. What follows is the part the code cannot hold — why each class is
protected, and what to do at the edges.

| Class                               | Rule                                                                              | Why                                                                                                                                                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Surnames                            | verbatim                                                                          | The archive is a town's families. A translated surname is a person nobody can find.                                                                                                                            |
| Nicknames                           | verbatim, quotation marks included                                                | «"Cachi" Dándolo» is a name. The marks are part of it, not punctuation around it.                                                                                                                              |
| Streets and routes                  | verbatim                                                                          | **This is the sharpest one.** A street name is what somebody types into the search box; translate it and the photograph becomes unfindable by the person most likely to want it.                               |
| Places                              | verbatim                                                                          | Same argument one level up, and see the first trap below.                                                                                                                                                      |
| Estancias, businesses, institutions | verbatim                                                                          | Proper names that happen to be made of common words: "El Cometa" is a farm, not a comet.                                                                                                                       |
| Local terms                         | Spanish plus a short gloss, **when the other language has no word for the thing** | The word survives because it _is_ the word; the gloss is what makes the caption readable to a descendant who does not speak Spanish. When the other language does have the word, it is translated — see below. |

### Which local terms stay in Spanish, and which are translated

**The test is whether the other language has a word that carries the thing.** Not
how local the term feels, and not how rarely it appears — counted in the archive,
five of the terms below (`parva`, `yerra`, `quebrachal`, `picadito`,
`ramos generales`) appear exactly once, and that is not what decides.

A term stays in Spanish when its nearest translation loses something or actively
misleads: `guardapolvo` is not a smock but _the_ Argentine school uniform,
`tenis criollo` is explicitly not tennis, `yerra` names the gathering rather than
the branding, `quebrachal` keeps the Spanish because the quebracho does.

A term is translated when the other language simply has the word.

> **Two terms have come off the protected list by this test**, and they are
> recorded here rather than quietly deleted, because the next person to read those
> captions will wonder.
>
> - **`fortines`**, decided in the first English pass: they were the small frontier
>   forts of the 1800s, English says "forts", nothing is lost.
> - **`trilla`**, which failed the same test the moment it was applied to it:
>   English has "threshing", French "battage", Italian "trebbiatura".
>
> Both are out of `PROTECTED` in `src/lib/glossary.ts` and out of the table below,
> so the check no longer flags them.

### The gloss, per language

Written once here rather than argued about per caption. The shape is
`carneada (a rural animal-butchering gathering)` — the Spanish term, then the
gloss in parentheses in the reader's language. ARCHITECTURE.md already does
exactly this in English, which is where the pattern comes from.

| Term              | English                                    | French                                 | Italian                                 |
| ----------------- | ------------------------------------------ | -------------------------------------- | --------------------------------------- |
| carneada          | a rural animal-butchering gathering        | un abattage collectif à la campagne    | una macellazione collettiva di campagna |
| parva / emparvado | a stack of harvested sheaves               | une meule de gerbes                    | un covone accatastato                   |
| parvero           | the man who builds the stack               | le meulier                             | l'uomo che fa il covone                 |
| yerra             | the branding of the cattle                 | le marquage du bétail                  | la marchiatura del bestiame             |
| tapera            | an abandoned rural dwelling                | une maison rurale abandonnée           | una casa rurale abbandonata             |
| quebrachal        | a stand of quebracho trees                 | un bois de quebrachos                  | un bosco di quebracho                   |
| picadito          | an informal game of football               | un match de football improvisé         | una partitella di calcio                |
| guardapolvo       | the white school smock worn in Argentina   | la blouse blanche d'écolier            | il grembiule bianco di scuola           |
| ramos generales   | a rural general store                      | un magasin général de campagne         | un emporio di campagna                  |
| tenis criollo     | a local racquet sport, unrelated to tennis | un sport de raquette local             | uno sport di racchetta locale           |
| FONAVI            | a state public-housing scheme              | un programme de logements sociaux      | un programma di edilizia popolare       |
| nona              | grandmother, in the local Italian usage    | grand-mère, dans l'usage italien local | nonna, nell'uso locale                  |

Gloss a term **once per page**, not once per caption: a reader who has met
_carneada_ three screens ago does not need it explained a fourth time, and a
caption is read next to the photograph rather than in a glossary.

### Six traps that do not follow from the list

1. **"María Luisa" is a locality in this archive**, and it has already been read
   as a woman's name once. It is also, in `espacios-070`, the given name of
   Marilú Ravasio. So the rule cannot be "never translate María Luisa" — it is
   "read the sentence". Both readings appear in the same archive.
2. **"20 de agosto" is a street and a date**, and the first English translation of
   `town_intro` found it: the patron saint's festival falls on _20 de agosto_ and
   there is `pasaje 20 de agosto` a few captions away. The date is translated —
   "August 20" is what an English reader needs — and the street is not. The check
   flags the date anyway, and it is right to: it cannot read a sentence, and this
   is the second entry after "María Luisa" where a person has to.
3. **"Eucaliptus" is an estancia and a tree.** The estancia gives a whole section
   its name and is protected; the eucalyptus growing on it is a common noun and is
   translated. Five captions carry the tree, and the check flags every one of them.
4. **There are two "La Pelada"**: the town, and the estancia in `campo-028`.
5. **Two captions are newspaper transcriptions, with the source's own
   misspellings** — `deporte-030` and `educacion-035` carry "Peladanse",
   "Fracisco", "Hilgero"/"Hilguero". They are transcribed, not corrected. A
   translation transcribes them too; it does not tidy up a 1929 typesetter.
6. **Punctuation carries meaning here.** The trailing `*` on `campo-002`,
   `espacios-029`, `religion-005` and `religion-012` is what ties the caption to
   its source note, and the blank line between paragraphs is what the page splits
   on — `town_intro` and several section intros have them, and the `campo` intro
   carries them as CRLF. Keep both.

### The check, and what it is not

`missingTerms()` in `src/lib/glossary.ts` reports protected terms that are in the
Spanish and absent from the translation. It runs in two places, from one list:
beside the box in the panel, and as a summary line at the end of
`npm run translations:export`.

It is **advisory and never a gate**. It matches plain substrings, folded for
accents and case, so "Tesolin" satisfies "Tesolín" — and it will not catch a term
that was rewritten into something that still contains it. It is a net for the
expensive, mechanical mistakes, not a proofreader. A person decides.

## Adding a fifth language

1. Add the code to the `locale` enum in `src/db/schema.ts` and to `locales` in
   `src/i18n/config.ts`, and add a text search configuration for it in the style
   of `drizzle/0001_search_config.sql`. Everything that counts progress reads the
   enum, so the panel's screens follow with no change.
2. Add its name to `LANGUAGE` in `src/app/admin/translations/items.ts` and a
   message file under `src/i18n/messages/`.
3. Add a proposals file and its import in
   `src/app/admin/translations/proposals/index.ts`.
4. **Come back to this document and write the gloss column.** That is the part
   that is neither mechanical nor optional, and the reason this file exists: the
   protected terms carry over unchanged, and what each local term should say in
   the new language is a decision somebody has to make once, on purpose.
