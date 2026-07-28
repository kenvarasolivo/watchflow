# Watchflow

A stock watchlist analytics platform built around a scheduled ETL pipeline.

You keep a watchlist of tickers. A GitHub Actions cron job pulls fresh daily
OHLCV for every one of them after the US close, validates it, derives metrics,
and upserts it into Postgres. The web app reads only what the pipeline has
already loaded — it never calls Yahoo Finance at request time.

The pipeline is the point of this project. The dashboard exists to prove the
pipeline works and to make its output legible.

**Pipeline workflow:** [`.github/workflows/pipeline.yml`](.github/workflows/pipeline.yml)

---

## Contents

- [Architecture](#architecture)
- [The TLS fingerprint problem](#the-tls-fingerprint-problem)
- [Pipeline design](#pipeline-design)
- [Data model](#data-model)
- [API](#api)
- [Setup](#setup)
- [Deployment](#deployment)
- [Operations](#operations)
- [Testing](#testing)
- [Design decisions](#design-decisions)
- [Scope](#scope)

---

## Architecture

```
                     ┌────────────────────────────────┐
   cron 22:00 UTC    │      GitHub Actions runner     │
   Mon–Fri  ────────▶│  python -m watchflow_pipeline  │
   + workflow_dispatch│                               │
                     │  ┌──────────────────────────┐  │
                     │  │ EXTRACT                  │  │
                     │  │  curl_cffi session       │──┼──▶ Yahoo Finance
                     │  │  (Chrome TLS fingerprint)│  │    (yfinance)
                     │  │  batched · incremental   │◀─┼──
                     │  │  retry + jittered backoff│  │
                     │  └───────────┬──────────────┘  │
                     │              ▼                 │
                     │  ┌──────────────────────────┐  │
                     │  │ TRANSFORM                │  │
                     │  │  Pydantic row validation │  │
                     │  │  NYSE calendar gap check │  │
                     │  │  returns · MA20/50 · vol │  │
                     │  └───────────┬──────────────┘  │
                     │              ▼                 │
                     │  ┌──────────────────────────┐  │
                     │  │ LOAD                     │  │
                     │  │  ON CONFLICT DO UPDATE   │  │
                     │  │  + pipeline_runs log row │  │
                     │  └───────────┬──────────────┘  │
                     └──────────────┼─────────────────┘
                                    ▼
                     ┌────────────────────────────────┐
                     │   Neon serverless Postgres     │
                     │  watchlists · watchlist_tickers│
                     │  prices · metrics              │
                     │  pipeline_runs                 │
                     └──────────────┬─────────────────┘
                                    │  Drizzle ORM (read)
                                    ▼
                     ┌────────────────────────────────┐
                     │  Next.js App Router on Vercel  │
                     │  server components + API routes│
                     │  Recharts · Tailwind           │
                     └────────────────────────────────┘
```

Two languages, one database, one direction of flow. The Python side writes; the
TypeScript side reads. They never call each other.

**There is no Python web service.** The pipeline is a CLI, not an API. This was
a deliberate choice over the FastAPI-on-Render alternative: the pipeline runs on
a schedule, produces rows, and exits — an always-on HTTP service in front of it
would add a deployment target, a cold-start problem and a second place for
secrets to live, in exchange for nothing. Next.js reads Postgres directly.

### Stack

| Layer | Choice |
|---|---|
| Web | Next.js 15 (App Router, TypeScript), Tailwind v4, Recharts |
| Web → DB | Drizzle ORM over `@neondatabase/serverless` (HTTP driver) |
| Pipeline | Python 3.12, yfinance + curl_cffi, Pydantic v2 |
| Pipeline → DB | SQLAlchemy Core over psycopg 3 |
| Database | Neon serverless Postgres |
| Schedule | GitHub Actions cron |
| Hosting | Vercel |

**One ORM per language boundary, and one owner for DDL.** Drizzle owns the
schema (`src/db/schema.ts`); its generated migration in `drizzle/` is the only
way tables are created or altered. The Python side declares the same tables to
SQLAlchemy Core purely so it can build typed statements — it issues DML only and
never calls `create_all`. If the two ever disagree, the migration is right.

---

## The TLS fingerprint problem

This is the real obstacle in the project, and the reason `curl_cffi` is a
dependency rather than a curiosity.

### The symptom

Running the extract step locally works. Deploy the identical code to a GitHub
Actions runner and it starts returning `HTTP 429 Too Many Requests` — often
after the first few requests succeed, which is what makes it so misleading. It
looks exactly like ordinary rate limiting, and the obvious response is to add
sleeps between requests, then longer sleeps, then a smaller batch size. None of
it helps. The requests-per-minute figure that works from a laptop fails from CI.

### The cause

Yahoo Finance does not fingerprint you by request rate alone. Its edge inspects
the **TLS ClientHello** — the first message a client sends when opening an HTTPS
connection. That message carries the ordered list of cipher suites, the TLS
extensions and their order, the supported elliptic curves, the ALPN protocol
list, and the signature algorithms. Hashed, this is a **JA3/JA4 fingerprint**,
and it is highly specific to the client library that produced it.

Python's `requests`/`urllib3` talk TLS through OpenSSL with settings no shipping
browser uses. The resulting fingerprint says "this is a Python script" as
plainly as a signed confession. Combine that with an IP in a datacenter ASN
(GitHub Actions, Vercel, Render, AWS — all of them) and you match the exact
profile of automated scraping. From a residential IP the same fingerprint is
tolerated; from a cloud IP it is throttled almost immediately.

### Why the usual fix doesn't work

Setting a browser `User-Agent` header does nothing. The header is
**application-layer data**, sent inside the encrypted tunnel *after* the
handshake completes. The fingerprint is taken **during** the handshake, from
bytes on the wire before any HTTP exists. You cannot reach it from a header. A
Python client sending Chrome's User-Agent over Python's TLS stack is *more*
suspicious than one that doesn't, not less — the mismatch is itself a signal.

```
  requests + User-Agent: Chrome        curl_cffi impersonate="chrome"
  ─────────────────────────────        ─────────────────────────────
  TCP  ──────────────▶                 TCP  ──────────────▶
  TLS ClientHello (OpenSSL)  ◀── seen  TLS ClientHello (Chrome's, byte for byte)
       │  JA3: python-ish       here        │  JA3: matches real Chrome
       ▼                                    ▼
  ❌ 429 / challenge                   ✅ 200 OK
  (the User-Agent header is never even read)
```

### The fix

[`curl_cffi`](https://github.com/lexiforest/curl_cffi) binds to
**curl-impersonate**, a build of libcurl patched to reproduce a specific
browser's TLS and HTTP/2 stack exactly — cipher order, extension order, ALPN,
HTTP/2 SETTINGS frame values, header order. A session created with
`impersonate="chrome"` produces a ClientHello indistinguishable from real
Chrome, so the handshake completes normally and the request is served, from a
datacenter IP, without a single extra second of sleeping.

```python
from curl_cffi import requests as curl_requests

session = curl_requests.Session(impersonate="chrome")
yf.download(tickers=[...], session=session, ...)
```

Two details that matter in practice, both implemented in
[`extract.py`](pipeline/watchflow_pipeline/extract.py):

1. **The session is passed to yfinance**, not used alongside it, so *every*
   underlying call — the cookie/crumb negotiation as well as the history
   requests — travels over the impersonated transport. Impersonating on some
   calls and not others is worse than not impersonating at all, because the
   inconsistency is itself detectable.

2. **`threads=False`.** yfinance's default thread pool fires concurrent requests,
   and a burst from one datacenter IP re-triggers the throttling that
   impersonation just solved. Batching sequentially is both gentler and, in
   wall-clock terms, barely slower for a personal watchlist.

The pipeline **refuses to fall back** to plain `requests` if `curl_cffi` is
missing. A silent fallback would work locally and fail in CI with an opaque 429
— reintroducing exactly the debugging dead end this section describes.

> The impersonation target is configurable via `WATCHFLOW_IMPERSONATE`. If
> Chrome's fingerprint ever stops working, bump it to a newer profile
> (`chrome131`, `safari17_0`) rather than reaching for sleeps.

---

## Pipeline design

### Extract

- **Incremental.** Each ticker's fetch window starts from its own watermark —
  `max(date)` in `prices` — not from the beginning of time. A daily run pulls a
  handful of bars per ticker, not a year of them.
- **Overlapping on purpose.** The window starts `WATCHFLOW_OVERLAP_DAYS` (default
  5) *before* the watermark rather than the day after it. Yahoo revises recent
  bars after the fact, and the overlap costs nothing because the load is an
  upsert. This is also what repairs a bar that was captured mid-session.
- **Batched.** Tickers sharing a start date are requested together, up to
  `WATCHFLOW_BATCH_SIZE` (default 12) per call. Tickers with *different* windows
  are never batched together, because `yf.download` takes one start date for the
  whole call — mixing them would over-fetch for some and under-fetch for others.
- **Retried with full jitter.** Transport failures (429, timeouts, TLS errors)
  back off exponentially with a delay drawn uniformly from `[0, backoff]`. Full
  jitter rather than fixed backoff because every batch fails at the same instant
  when Yahoo throttles; retrying them on a shared schedule reproduces the burst
  that caused it. Data problems ("possibly delisted") are *not* retried — that
  would spend the retry budget on a question already answered.

### Transform

- **Row-level validation.** Every bar is parsed by a Pydantic model
  ([`models.py`](pipeline/watchflow_pipeline/models.py)) requiring all of
  ticker/date/OHLC/volume, with prices positive and finite, volume non-negative,
  and the candle internally coherent (`high ≥ max(open, close)`,
  `low ≤ min(open, close)`). Failures are **rejected and logged, never dropped
  silently and never allowed to crash the run** — one bad bar for one ticker
  must not cost the other nineteen tickers their data.
- **Gaps, distinguished from closures.** Weekends and NYSE holidays are *not*
  missing data and are never flagged. A hole on a real trading day is, and gets
  written to the run log. The calendar
  ([`trading_calendar.py`](pipeline/watchflow_pipeline/trading_calendar.py)) is
  self-contained: weekend rules, the ten annual holidays, Good Friday via the
  Gregorian computus, weekend-observance shifting, and the quirk that the NYSE
  does *not* close the preceding Friday when New Year's Day falls on a Saturday.
- **Dates, not timestamps.** yfinance indexes daily bars at midnight in the
  *exchange's* timezone, so the calendar date is read straight off the index.
  Normalising through UTC would shift bars across the date boundary.
- **Derived metrics**, computed per ticker/date:

  | Metric | Definition |
  |---|---|
  | `daily_return` | close-to-close, in percent |
  | `ma_20` / `ma_50` | trailing simple moving average of close |
  | `volatility_30d` | sample stddev of the trailing 30 daily returns, annualised ×√252, in percent |

  Every metric is `NULL` until its window is genuinely full. A 12-observation
  "20-day average" would be a different statistic wearing the same name.

- **Warm-up context.** This is what makes incremental extraction *correct*
  rather than merely cheap. A run that fetches three new bars still needs the
  previous 49 closes to produce a true MA-50 for them, so after prices land the
  pipeline reads a warm-up window back out of Postgres, computes over the
  combined series, and emits metrics only for the refreshed range.

### Load

- **Idempotent by construction.** Both `prices` and `metrics` load via
  `INSERT … ON CONFLICT (ticker, date) DO UPDATE`. Re-running over an
  already-loaded range overwrites each row with the same values — it cannot
  duplicate and cannot corrupt. The conflict key itself is never in the `SET`
  clause. This is asserted at the SQL level in
  [`test_load.py`](pipeline/tests/test_load.py) and, when a database is
  available, round-tripped for real.
- **Prices quantised to `numeric(18,6)` at validation time**, so a re-run writes
  byte-identical values instead of churning rows on float noise.
- **Per-ticker transactions.** A failure on ticker 15 does not roll back tickers
  1–14.

### The run log

Every execution writes a `pipeline_runs` row — opened *before* any work starts
and committed immediately, so a run that dies hard still leaves evidence it
began. Recorded: start/finish, tickers processed, rows upserted, rows rejected,
status, an error summary, and free-text details (gaps, per-ticker notes).

Status is one of `running` / `success` / `partial_failure` / `failed`.
`partial_failure` covers rejected rows as well as failed batches, because data
that was fetched and then discarded is a real loss — a log that called it
"success" would hide the exact thing the log exists to reveal.

The web app surfaces this at [`/pipeline`](#api) and as a "data last updated"
badge on every page. Without it, a cron that silently stopped firing would look
identical to a market that stopped moving.

**One deliberate exception.** A bar dated *today* that fails validation is
recorded as a note, not a rejection. While the session is open Yahoo serves a
partially-formed candle whose high/low have not caught up with the live price;
that is provisional data, not corrupt data, and the next run's overlap window
refetches it once settled. Counting it would paint every intraday run
`partial_failure` in perpetuity and train everyone to ignore the status.

---

## Data model

`prices` (raw ingestion) and `metrics` (analytics) are **separate tables**,
both keyed `(ticker, date)`.

The reason is that they change for different reasons and at different rates.
Metric definitions are volatile — swap the volatility window, add RSI — while
OHLCV is stable and expensive to re-fetch. Keeping them apart means metrics can
be recomputed from `prices` without touching Yahoo at all. Merged into one row,
a change to a cheap derived column would mean rewriting the expensive fact
table, and the "clear separation between raw ingestion and the analytics layer"
would exist only as a comment.

```
watchlists          id · name (unique) · created_at
watchlist_tickers   (watchlist_id → watchlists.id, ticker) PK · name · added_at
prices              (ticker, date) PK · open · high · low · close · volume · updated_at
metrics             (ticker, date) PK · daily_return · ma_20 · ma_50 · volatility_30d · updated_at
pipeline_runs       id · started_at · finished_at · tickers_processed · rows_upserted
                    · rows_rejected · status · error_summary · details · trigger
```

Money columns are `numeric`, not `double precision`: exact in SQL comparisons
and byte-stable across repeated upserts. The read layer casts to `float8` in the
query, so the browser still receives real numbers rather than strings.

The extract set is defined as the **union of all watchlists' tickers**. v1 has
exactly one watchlist, but writing it this way means adding more later needs no
pipeline change.

`watchlist_tickers.name` holds the company name (`AAPL` → `Apple Inc.`) as
resolved from Yahoo's search endpoint when the ticker was added. It is nullable
and **only ever written on a definitive match** — an `unknown` lookup means
Yahoo was unreachable, not that the company is nameless, and storing a guess
would make the column indistinguishable from the local fallback table it is
supposed to outrank. Rendering falls back to
[`src/lib/companies.ts`](src/lib/companies.ts), which covers the US large caps,
the major ETFs and indices, the liquid crypto pairs and the European blue chips,
so rows seeded before the column existed — and ticker pages for symbols that
were never on the watchlist — still show a name rather than a bare symbol.

---

## API

Reads are public. Writes are gated by a shared secret when
`WATCHFLOW_WRITE_TOKEN` is set (see [Setup](#setup)).

| Route | Notes |
|---|---|
| `GET /api/watchlist` | Tracked tickers with latest close, daily return, 30-point sparkline |
| `POST /api/watchlist` | `{ "ticker": "AAPL" }` — validates the symbol before adding |
| `DELETE /api/watchlist/:ticker` | Stops tracking; **price history is kept** |
| `GET /api/prices/:ticker?range=30d\|90d\|1y` | OHLCV + derived metrics for charting |
| `GET /api/watchlist/performance?range=30d\|90d\|1y` | Window return per ticker, best to worst |
| `GET /api/pipeline/status` | Latest run, for the freshness badge |

Pages: `/` (landing), `/watchlist` (the list), `/ticker/[symbol]` (detail),
`/performance` (ranked comparison), `/pipeline` (run log).

The landing page reads the database but does **not** fail with it: if Postgres
is unreachable, the live ticker strip and last-run figures are replaced by a
notice and the rest of the page still renders. The app pages behind it show the
full setup notice with the underlying error.

**Ticker validation is deliberately three-valued.** `POST /api/watchlist` checks
the symbol against Yahoo's search endpoint, which returns `valid`, `invalid` or
`unknown`. Only a definitive negative blocks the add. This matters because the
route runs on Vercel — a datacenter IP — and hits the same edge described above,
without curl_cffi's help (Node cannot impersonate a TLS fingerprint the way the
Python pipeline can). Treating a rate-limited lookup as "invalid ticker" would
reject `AAPL` because Yahoo was busy. On `unknown` the ticker is accepted, the
UI says so plainly, and the next pipeline run is the real arbiter: a symbol that
does not exist simply never receives rows.

Deleting a ticker keeps its `prices` and `metrics`. Removing something from a
watchlist is a statement about what you want to watch, not an instruction to
destroy ingested data — and re-adding it later is then instant.

---

## Setup

Prerequisites: Node 20+, Python 3.11+, a [Neon](https://neon.tech) database.

```bash
git clone <your-repo-url> watchflow
cd watchflow

# 1. Environment
cp .env.example .env.local        # fill in DATABASE_URL
```

`DATABASE_URL` is shared by all three consumers. Paste Neon's connection string
verbatim — the pipeline rewrites the scheme to `postgresql+psycopg://` itself so
you never have to keep two versions of it.

```bash
# 2. Schema and starter data
npm install
npm run db:migrate                # applies drizzle/0000_*.sql
npm run db:seed                   # default watchlist + 36 widely-tracked tickers and ETFs

# 3. First pipeline run
cd pipeline
python -m venv .venv
.venv/Scripts/activate            # Windows
# source .venv/bin/activate       # macOS / Linux
pip install -r requirements.txt

# `.env.local` is not auto-loaded by Python — export it for the shell:
export DATABASE_URL="postgresql://…"     # or $env:DATABASE_URL="…" in PowerShell
python -m watchflow_pipeline

# 4. Run the app
cd ..
npm run dev                       # http://localhost:3000
```

The first run backfills `WATCHFLOW_BACKFILL_DAYS` (default 400) of history so
the 50-day moving average and 1-year range have something to work with. Later
runs are incremental and take seconds.

### Environment variables

Full annotated list in [`.env.example`](.env.example). The essentials:

| Variable | Used by | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | all | — | Neon connection string (**required**) |
| `WATCHFLOW_WRITE_TOKEN` | web | unset | Gates the mutating routes. Unset = writes open |
| `WATCHFLOW_IMPERSONATE` | pipeline | `chrome` | curl_cffi browser profile |
| `WATCHFLOW_BACKFILL_DAYS` | pipeline | `400` | Lookback for a ticker with no history |
| `WATCHFLOW_OVERLAP_DAYS` | pipeline | `5` | Days re-fetched before the watermark |
| `WATCHFLOW_BATCH_SIZE` | pipeline | `12` | Tickers per yfinance call |
| `WATCHFLOW_MAX_RETRIES` | pipeline | `5` | Attempts before a batch is abandoned |

---

## Deployment

### Vercel (web)

1. Import the GitHub repo.
2. Set `DATABASE_URL` (and `WATCHFLOW_WRITE_TOKEN` — see below) in Project
   Settings → Environment Variables.
3. Deploy. Build settings are detected; no override needed.

Every page is `force-dynamic`, so the build never touches Postgres and a
misconfigured env var surfaces as a clear in-app setup notice rather than a
failed build.

> **Upgrading an existing deployment:** run `npm run db:migrate` once to apply
> `drizzle/0001_*.sql`, which adds the nullable `watchlist_tickers.name` column.
> It is additive and changes no existing data, but the read queries select the
> column, so the app reports `column "name" does not exist` until it is applied.

> **Set `WATCHFLOW_WRITE_TOKEN` on any public deployment.** Without it, anyone
> who finds the URL can edit the watchlist. Generate one with
> `openssl rand -hex 24`. The UI then shows a token field beside the add form;
> it is stored in `localStorage` and sent as `x-watchflow-token`. This is a
> shared secret, not a login — v1 has no accounts by design.

### GitHub Actions (pipeline)

Add `DATABASE_URL` as a repository **secret** (Settings → Secrets and variables
→ Actions). Optionally add `WATCHFLOW_IMPERSONATE` as a repository **variable**.

That is the whole setup. `.github/workflows/pipeline.yml` then runs at 22:00 UTC
on weekdays and can be triggered manually from the Actions tab, with
`--full-refresh` and `--dry-run` exposed as inputs.

The workflow exits non-zero on `partial_failure` as well as outright failure. A
scheduled run that quietly lost a ticker should not be green.

### No Render service

The Python side is a scheduled CLI, so there is nothing to host. If you later
want an on-demand HTTP trigger, `workflow_dispatch` already provides one
without a second deployment target.

---

## Operations

```bash
# Normal incremental run
python -m watchflow_pipeline

# Exercise extract + transform against live Yahoo, write nothing
python -m watchflow_pipeline --dry-run -v

# After a stock split — Yahoo retroactively adjusts ALL history, which the
# 5-day overlap window cannot repair
python -m watchflow_pipeline --full-refresh

# Reproduce a past run
python -m watchflow_pipeline --as-of 2026-07-24
```

**Prices are split- and dividend-adjusted** (`auto_adjust=True`). Unadjusted
prices would put a fabricated −50% daily return in the metrics on every split
date. The trade-off is the one `--full-refresh` exists for.

### Reading the run log

| Symptom in `/pipeline` | Likely cause |
|---|---|
| No runs at all | Workflow never ran, or `DATABASE_URL` secret missing |
| `failed`, every batch errored | Yahoo blocking — try a newer `WATCHFLOW_IMPERSONATE` profile |
| `partial_failure`, rows rejected | Genuinely malformed bars; details list ticker + date + reason |
| Gaps flagged on a non-US ticker | Expected — the calendar is NYSE, so `RY.TO` shows false gaps on Canadian holidays. Informational only; never fails a run |
| Stuck on `running` | The runner was killed mid-run. The next run is unaffected — loads are idempotent |

---

## Testing

```bash
cd pipeline
pip install -r requirements-dev.txt
pytest -q                          # 103 tests
```

Covered: NYSE calendar edge cases (Good Friday, weekend observance, the New
Year's-on-a-Saturday quirk, ad-hoc closures), Pydantic acceptance and rejection,
metric correctness against independently computed values, warm-up windowing,
batch planning, retry classification, yfinance response shapes (flat and both
MultiIndex orderings), NaN batch-padding vs. genuinely malformed rows, and
run-status resolution.

Idempotency is verified at two levels:

1. **Always** — the emitted SQL is compiled and asserted to be a real
   `ON CONFLICT (ticker, date) DO UPDATE` that refreshes every mutable column
   and never rewrites the key. No database needed; runs in CI on every push.
2. **When available** — set `WATCHFLOW_TEST_DATABASE_URL` to a migrated Postgres
   and the round-trip tests load the same rows twice and check the table
   afterwards. They **skip** rather than silently pass when it is unset.

---

## Design decisions

Choices worth stating, with the reasoning rather than just the outcome:

- **CLI pipeline over a FastAPI service.** The work is scheduled and batch-shaped;
  an always-on HTTP service would add a deployment target, cold starts and a
  second secrets store for no gain.
- **Drizzle owns DDL, SQLAlchemy issues DML only.** Two migration paths that can
  disagree is a bug generator. There is exactly one, and it is the TypeScript
  one.
- **Separate `prices` and `metrics` tables.** Volatile derived columns must not
  force rewrites of the stable, expensive-to-fetch fact table.
- **`numeric` for money.** Exact comparisons and byte-stable upserts; cast to
  `float8` at read time so the browser gets numbers.
- **Server components read Postgres directly**, rather than fetching the app's
  own API routes over HTTP. The routes exist for external consumers.
- **Calendar-based ranges.** "30d" means 30 calendar days. The row count is
  smaller because weekends have no rows — that is correct, not a gap.
- **Reject-and-log over drop-or-crash.** The two easy failure modes are losing
  data silently and losing a whole run to one bad row. The run log is the third
  option.

### Visual design

Light, single-mode by intent: a white page, near-black type set heavy and tight,
and colour only where it carries meaning. Inter Tight for headings, Inter for
prose, DM Mono for every figure — tabular figures in tables, proportional ones
for large standalone stats.

**One accent, and it is not the button colour.** The accent is a deep leaf green
(`#0b6b3a`). Primary actions are solid ink, which leaves green free to mean
exactly two things: the brand mark, and "up". A green CTA sitting beside a green
`+1.24%` would make the colour ambiguous at the only moment it matters.

The palette is **measured, not eyeballed** — every token against all three
surfaces it can land on (`#ffffff`, `#f6f7f8`, `#f0f2f4`):

| Role | Token | Contrast on white |
|---|---|---|
| Primary ink | `#0a0a0a` | 19.8:1 |
| Secondary ink | `#4b5563` | 7.6:1 |
| Muted ink | `#6b7280` | 4.8:1 |
| Gain | `#0b6b3a` | 6.6:1 |
| Loss | `#b42318` | 6.6:1 |
| MA-20 | `#c2410c` | 5.2:1 |
| MA-50 | `#1d4ed8` | 6.7:1 |
| Volume bars | `#828c99` | 3.4:1 |

Two separation results shaped the rules rather than just the values:

- **gain vs loss** separates by ΔE 26.6 for normal vision but only **7.8 under
  deuteranopia**. That is not fixed by picking different reds and greens; it is
  fixed by never letting colour carry the sign alone. Every delta ships an arrow
  glyph and an explicit `+`/`−`, the performance bars are directly labelled, and
  every chart has a table view.
- **MA-20 orange collapses onto gain green under protanopia** (ΔE 4.7). So green
  stays out of the price chart entirely. The close line is ink and carries the
  emphasis at 2px; the two averages recede into the validated categorical hues
  (ΔE 36.6 normal / 34.6 deuteranopia / 30.4 protanopia) at 1.5px.

The landing page's ink band is the only inverted surface in the app. gain/loss
measure under 2:1 on `#0a0a0a`, so that one section takes a lighter pair
(`#4ade80` / `#fca5a5`, 10.6:1 and 9.7:1) used nowhere else.

There is no dual-axis chart anywhere. Volume sits in its own plot beneath the
price chart sharing the x-axis, because aligning two y-scales on one plot
invents a relationship the data does not contain.

---

## Scope

**In:** watchlist CRUD, daily OHLCV ingestion, derived metrics, per-ticker
charts, ranked watchlist performance, pipeline observability.

**Out, deliberately:** multi-user accounts and auth; real-time or intraday
prices (daily granularity is sufficient and far simpler); trading or order
execution of any kind; backtesting and strategy simulation.

Not investment advice. Prices are end-of-day and can be wrong.
