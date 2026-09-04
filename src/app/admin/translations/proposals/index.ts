import 'server-only'
import type { Locale } from '@/i18n/config'
import en from './en.json'
import fr from './fr.json'
import it from './it.json'

/**
 * The machine's proposals, waiting to be reviewed.
 *
 * **They live in the repository and never in the database**, which is the
 * decision the whole editor is arranged around. A row in `photo_translation`
 * with a non-empty caption therefore means *a person read this and kept it* --
 * by construction, with no column to add and no state to keep in sync. The
 * public site cannot serve an unreviewed machine translation because there is no
 * path by which one could get there.
 *
 * It buys a third thing for free: what the machine said stays in git, so the
 * diff between the proposal and what was saved is readable years from now.
 *
 * **Indexed by the source text and not by the photograph.** Three consequences,
 * all of them free: the 118 captions that are duplicated word for word across the
 * archive get translated once, the file holds 401 entries instead of 519, and a
 * proposal stops being offered by itself the moment somebody corrects the
 * Spanish -- the key no longer matches, which is exactly the right behaviour for
 * a translation of text that has since changed.
 *
 * ponytail: the queue still shows those 118 duplicates as separate rows, so each
 * is *translated* once and *clicked past* three times. Grouping them means a form
 * field whose identity is a list of slugs instead of one, which is the worse
 * trade until the clicks are the complaint. F52.
 *
 * `tools/translations.ts` writes these files; nothing in the application does.
 */

export type ProposalFile = {
  locale: string
  items: { source: string; proposed: string }[]
}

/**
 * Static imports, so the build traces them and no `outputFileTracingIncludes` is
 * needed. Three files of a few hundred KB reach the **server** bundle of one
 * authenticated screen and nothing else: the panel is dynamic, so nothing here is
 * prerendered into a page, and `server-only` above makes a client import a build
 * error rather than a payload.
 *
 * ponytail: three files read whole. If the archive ever outgrows that, the shape
 * that replaces it is a table, and the reason to move is memory rather than
 * tidiness.
 */
const FILES: Record<string, ProposalFile> = {
  en: en as ProposalFile,
  fr: fr as ProposalFile,
  it: it as ProposalFile,
}

/**
 * Source text to proposed translation, for one language.
 *
 * An entry with nothing in `proposed` is dropped: the file is generated with the
 * whole archive in it and filled in over time, so "no proposal yet" and "no entry"
 * have to mean the same thing to the screen.
 */
const BY_LOCALE = new Map<string, Map<string, string>>()

export function proposalsFor(locale: Locale): Map<string, string> {
  let index = BY_LOCALE.get(locale)
  if (index) return index

  const file = FILES[locale]
  index = new Map(
    (file?.items ?? []).flatMap((item) =>
      item.proposed.trim() ? [[item.source, item.proposed] as [string, string]] : [],
    ),
  )
  // The files are static imports, so this is a pure function of something that
  // cannot change between requests: built once per process rather than once per
  // render of a screen that draws three languages at a time.
  BY_LOCALE.set(locale, index)
  return index
}
