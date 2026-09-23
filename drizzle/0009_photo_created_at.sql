-- When each photograph was written, for the home page's "Recién añadidas".
--
-- Hand-edited: drizzle-kit adds the column with its default in one statement,
-- and Postgres fills every existing row with that default -- which would stamp
-- the 592 rescued from Sites with today's date and make an arbitrary dozen of
-- them "new". So the column arrives empty, the Drive imports (the only rows that
-- were ever added, as opposed to rescued) share one stamp, and the default is set
-- last, for the rows to come. Among the shared stamp `id` breaks the tie, which is
-- import order.

ALTER TABLE "photo" ADD COLUMN "created_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "photo" SET "created_at" = now() WHERE "master_source" = 'drive';
--> statement-breakpoint
ALTER TABLE "photo" ALTER COLUMN "created_at" SET DEFAULT now();
