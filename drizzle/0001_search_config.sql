-- Full-text search, accent-insensitive, one configuration per language.
--
-- "Tesolin" has to find "Tesolín" and "educacion" has to find "Educación": the
-- surnames in this archive are Italian and Spanish, and nobody types the accents
-- into a search box. Postgres does that by putting `unaccent` in front of the
-- stemmer, which needs a text search configuration of our own per language --
-- the built-in `spanish` cannot be altered.

CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint

CREATE TEXT SEARCH CONFIGURATION es_unaccent ( COPY = spanish );
--> statement-breakpoint
ALTER TEXT SEARCH CONFIGURATION es_unaccent
  ALTER MAPPING FOR hword, hword_part, word WITH unaccent, spanish_stem;
--> statement-breakpoint

CREATE TEXT SEARCH CONFIGURATION en_unaccent ( COPY = english );
--> statement-breakpoint
ALTER TEXT SEARCH CONFIGURATION en_unaccent
  ALTER MAPPING FOR hword, hword_part, word WITH unaccent, english_stem;
--> statement-breakpoint

CREATE TEXT SEARCH CONFIGURATION fr_unaccent ( COPY = french );
--> statement-breakpoint
ALTER TEXT SEARCH CONFIGURATION fr_unaccent
  ALTER MAPPING FOR hword, hword_part, word WITH unaccent, french_stem;
--> statement-breakpoint

CREATE TEXT SEARCH CONFIGURATION it_unaccent ( COPY = italian );
--> statement-breakpoint
ALTER TEXT SEARCH CONFIGURATION it_unaccent
  ALTER MAPPING FOR hword, hword_part, word WITH unaccent, italian_stem;
--> statement-breakpoint

-- `photo_translation.search_vector` is filled here rather than by application
-- code. A generated column cannot do it, because picking the configuration from
-- the row's `locale` is not an immutable expression, and a trigger beats writing
-- it on every save path: the seed, the admin panel and the translation editor
-- all get it for free and none of them can forget.
CREATE OR REPLACE FUNCTION photo_translation_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector(
    CASE NEW.locale
      WHEN 'en' THEN 'en_unaccent'::regconfig
      WHEN 'fr' THEN 'fr_unaccent'::regconfig
      WHEN 'it' THEN 'it_unaccent'::regconfig
      ELSE 'es_unaccent'::regconfig
    END,
    coalesce(NEW.caption, '') || ' ' || coalesce(NEW.notes, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER photo_translation_search_vector
  BEFORE INSERT OR UPDATE OF caption, notes, locale ON photo_translation
  FOR EACH ROW EXECUTE FUNCTION photo_translation_search_vector();
