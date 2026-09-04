CREATE TABLE "video" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "video_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" varchar(64) NOT NULL,
	"youtube_id" varchar(16) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"web_key" text,
	"web_width" integer,
	"web_height" integer,
	"thumb_key" text,
	CONSTRAINT "video_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "video_translation" (
	"video_id" integer NOT NULL,
	"locale" "locale" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	CONSTRAINT "video_translation_video_id_locale_pk" PRIMARY KEY("video_id","locale")
);
--> statement-breakpoint
ALTER TABLE "video_translation" ADD CONSTRAINT "video_translation_video_id_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."video"("id") ON DELETE cascade ON UPDATE no action;