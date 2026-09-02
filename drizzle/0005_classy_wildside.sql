-- The Drive import's idempotency: re-importing a folder must not duplicate a
-- photograph. Partial because the 592 rescued from Sites carry null here.
-- See the note on the index in src/db/schema.ts.
CREATE UNIQUE INDEX "photo_drive_file_id_key" ON "photo" USING btree ("drive_file_id") WHERE "photo"."drive_file_id" is not null;