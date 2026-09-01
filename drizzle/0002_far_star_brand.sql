CREATE TABLE "site_text" (
	"key" varchar(64) NOT NULL,
	"locale" "locale" NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "site_text_key_locale_pk" PRIMARY KEY("key","locale")
);
