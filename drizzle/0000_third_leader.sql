CREATE TYPE "public"."locale" AS ENUM('es', 'en', 'fr', 'it');--> statement-breakpoint
CREATE TYPE "public"."master_source" AS ENUM('sites', 'drive');--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "app_user_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"email" text NOT NULL,
	"name" text,
	CONSTRAINT "app_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "category" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "category_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" varchar(64) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"cover_photo_id" integer,
	CONSTRAINT "category_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "category_translation" (
	"category_id" integer NOT NULL,
	"locale" "locale" NOT NULL,
	"name" text NOT NULL,
	"intro" text,
	CONSTRAINT "category_translation_category_id_locale_pk" PRIMARY KEY("category_id","locale")
);
--> statement-breakpoint
CREATE TABLE "photo" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "photo_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" varchar(64) NOT NULL,
	"credit" text,
	"source" text,
	"year_from" integer,
	"year_to" integer,
	"place" text,
	"sensitive" boolean DEFAULT false NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"master_source" "master_source" NOT NULL,
	"drive_file_id" text,
	"master_key" text,
	"master_width" integer NOT NULL,
	"master_height" integer NOT NULL,
	"master_bytes" integer NOT NULL,
	"master_sha256" varchar(64) NOT NULL,
	"web_key" text,
	"web_width" integer,
	"web_height" integer,
	"thumb_key" text,
	"restored_drive_file_id" text,
	"restored_web_key" text,
	"restored_thumb_key" text,
	"restored_method" text,
	"restored_at" timestamp with time zone,
	CONSTRAINT "photo_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "photo_category" (
	"photo_id" integer NOT NULL,
	"category_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "photo_category_photo_id_category_id_pk" PRIMARY KEY("photo_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "photo_translation" (
	"photo_id" integer NOT NULL,
	"locale" "locale" NOT NULL,
	"caption" text,
	"notes" text,
	"search_vector" "tsvector",
	CONSTRAINT "photo_translation_photo_id_locale_pk" PRIMARY KEY("photo_id","locale")
);
--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_cover_photo_id_photo_id_fk" FOREIGN KEY ("cover_photo_id") REFERENCES "public"."photo"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_translation" ADD CONSTRAINT "category_translation_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_category" ADD CONSTRAINT "photo_category_photo_id_photo_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_category" ADD CONSTRAINT "photo_category_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_translation" ADD CONSTRAINT "photo_translation_photo_id_photo_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "photo_category_gallery_idx" ON "photo_category" USING btree ("category_id","position");--> statement-breakpoint
CREATE INDEX "photo_translation_search_idx" ON "photo_translation" USING gin ("search_vector");