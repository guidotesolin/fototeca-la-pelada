-- "Destacadas" is gone: the home page's strip is "Recién añadidas" now, ordered
-- by `created_at`. Nothing in production was ever marked, so nothing is lost.
ALTER TABLE "photo" DROP COLUMN "featured";
