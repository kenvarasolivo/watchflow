CREATE TABLE "news" (
	"ticker" varchar(16) NOT NULL,
	"article_id" varchar(64) NOT NULL,
	"title" text NOT NULL,
	"publisher" varchar(128),
	"link" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "news_ticker_article_id_pk" PRIMARY KEY("ticker","article_id")
);
--> statement-breakpoint
CREATE TABLE "predictions" (
	"ticker" varchar(16) NOT NULL,
	"target_date" date NOT NULL,
	"basis_date" date NOT NULL,
	"basis_close" numeric(18, 6) NOT NULL,
	"central" numeric(18, 6) NOT NULL,
	"low" numeric(18, 6) NOT NULL,
	"high" numeric(18, 6) NOT NULL,
	"sigma_pct" numeric(12, 6) NOT NULL,
	"drift_pct" numeric(12, 6) NOT NULL,
	"sample_size" integer NOT NULL,
	"actual_close" numeric(18, 6),
	"actual_return_pct" numeric(12, 6),
	"within_band" boolean,
	"error_pct" numeric(12, 6),
	"scored_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "predictions_ticker_target_date_pk" PRIMARY KEY("ticker","target_date")
);
--> statement-breakpoint
CREATE INDEX "news_ticker_published_desc_idx" ON "news" USING btree ("ticker","published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "predictions_ticker_target_desc_idx" ON "predictions" USING btree ("ticker","target_date" DESC NULLS LAST);