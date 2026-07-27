CREATE TYPE "public"."pipeline_status" AS ENUM('running', 'success', 'partial_failure', 'failed');--> statement-breakpoint
CREATE TABLE "metrics" (
	"ticker" varchar(16) NOT NULL,
	"date" date NOT NULL,
	"daily_return" numeric(12, 6),
	"ma_20" numeric(18, 6),
	"ma_50" numeric(18, 6),
	"volatility_30d" numeric(12, 6),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metrics_ticker_date_pk" PRIMARY KEY("ticker","date")
);
--> statement-breakpoint
CREATE TABLE "pipeline_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"tickers_processed" integer DEFAULT 0 NOT NULL,
	"rows_upserted" integer DEFAULT 0 NOT NULL,
	"rows_rejected" integer DEFAULT 0 NOT NULL,
	"status" "pipeline_status" DEFAULT 'running' NOT NULL,
	"error_summary" text,
	"details" text,
	"trigger" varchar(32) DEFAULT 'manual' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prices" (
	"ticker" varchar(16) NOT NULL,
	"date" date NOT NULL,
	"open" numeric(18, 6) NOT NULL,
	"high" numeric(18, 6) NOT NULL,
	"low" numeric(18, 6) NOT NULL,
	"close" numeric(18, 6) NOT NULL,
	"volume" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prices_ticker_date_pk" PRIMARY KEY("ticker","date")
);
--> statement-breakpoint
CREATE TABLE "watchlist_tickers" (
	"watchlist_id" integer NOT NULL,
	"ticker" varchar(16) NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watchlist_tickers_watchlist_id_ticker_pk" PRIMARY KEY("watchlist_id","ticker")
);
--> statement-breakpoint
CREATE TABLE "watchlists" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "watchlist_tickers" ADD CONSTRAINT "watchlist_tickers_watchlist_id_watchlists_id_fk" FOREIGN KEY ("watchlist_id") REFERENCES "public"."watchlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "metrics_ticker_date_desc_idx" ON "metrics" USING btree ("ticker","date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "pipeline_runs_started_at_idx" ON "pipeline_runs" USING btree ("started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "prices_ticker_date_desc_idx" ON "prices" USING btree ("ticker","date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "watchlist_tickers_ticker_idx" ON "watchlist_tickers" USING btree ("ticker");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlists_name_key" ON "watchlists" USING btree ("name");