import type { NewsHeadline, SeriesPoint } from "@/db/queries";

/**
 * Session attribution — turning a number into a sentence.
 *
 * What this is honest about
 * -------------------------
 * Nothing here establishes causation, and the wording is chosen so it never
 * implies it did. Every observation below is a *description* of the session
 * that produced the move: how large it was against this stock's own recent
 * behaviour, how much of it was already there at the open, how much stock
 * changed hands, where the close landed relative to its own averages. Those
 * are facts about the tape, and they are genuinely what a reader wants when a
 * ticker is down 5% — "was that a big move for this thing, and did it happen
 * overnight or during the day" is answerable, whereas "why" is not, from OHLCV.
 *
 * Headlines are matched by time proximity and nothing else (see
 * `headlinesAround`). A story published in the same window as a move is
 * evidence of what was being reported, not proof of what caused it, and the UI
 * that renders these says so rather than leaving the reader to assume.
 *
 * How observations are chosen
 * ---------------------------
 * Each rule returns an observation carrying a `weight`, which is roughly "how
 * many times more extreme than normal is this". The list is sorted by weight
 * and truncated, so a quiet session yields one line and a violent one yields
 * four. The alternative — printing every rule's output every time — trains the
 * reader to skip the block, because the sentence that matters is buried in
 * three that say "volume was about average".
 *
 * Everything is computed from the fixed lookback `getRecentSeries` returns, not
 * from the range the reader picked, so the baselines do not move when the chart
 * above changes.
 */

/** Trading days per year — the same annualisation factor the pipeline uses. */
const TRADING_DAYS_PER_YEAR = 252;

/** Sessions of context a baseline needs before it is worth comparing against. */
const MIN_BASELINE_SESSIONS = 10;

/** Sessions in the volume and range baselines, when that much history exists. */
const BASELINE_WINDOW = 30;

/** Below this the day is flat and the rules that divide by it say nothing. */
const FLAT_MOVE_PCT = 0.1;

/** Observations shown. Past four, the block reads as a wall rather than a note. */
const MAX_OBSERVATIONS = 4;

export type Observation = {
  id: string;
  /** One sentence, already formatted for display. */
  text: string;
  /** Roughly "times more extreme than normal"; used only for ranking. */
  weight: number;
};

export type SessionExplanation = {
  date: string;
  close: number;
  previousClose: number | null;
  dailyReturn: number | null;
  /** This stock's typical one-session move, in percent. */
  typicalMovePct: number | null;
  /** `|dailyReturn| / typicalMovePct` — the move in units of a normal session. */
  moveInTypicalMoves: number | null;
  observations: Observation[];
};

/**
 * De-annualise the stored 30-day volatility into a one-session figure.
 *
 * Uses `metrics.volatility_30d` rather than recomputing a standard deviation
 * from the series, so the "typical session" this page reasons about is the
 * same number as the "Volatility 30d" tile beside it. Two independently
 * computed volatilities that disagree by a decimal is the kind of detail that
 * costs a reader their trust in both.
 */
export function typicalMovePct(volatility30d: number | null | undefined): number | null {
  if (volatility30d === null || volatility30d === undefined) return null;
  if (!Number.isFinite(volatility30d) || volatility30d <= 0) return null;
  return volatility30d / Math.sqrt(TRADING_DAYS_PER_YEAR);
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** `2.34` → `"2.3×"`, with a second decimal only where it earns its place. */
function ratio(value: number): string {
  return value >= 10 ? `${value.toFixed(0)}×` : `${value.toFixed(1)}×`;
}

function signed(value: number, digits = 2): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function sessions(count: number): string {
  return `${count} session${count === 1 ? "" : "s"}`;
}

/**
 * Describe the most recent session in `series`.
 *
 * Returns `null` when there is no session to describe or no prior close to
 * measure it against — a ticker whose very first bar just landed has nothing to
 * be explained relative to, and inventing context for it would be worse than
 * showing none.
 */
export function explainLatestSession(
  series: SeriesPoint[],
  /**
   * The "typical session" figure to measure the move against, when the caller
   * has a better one than this module can derive.
   *
   * The forecast's sigma is estimated from log returns; de-annualising
   * `volatility_30d` goes through simple returns. Over the same 30 sessions the
   * two land within a few hundredths of a percent of each other — close enough
   * to look like a typo when both appear on one page, and far enough apart to
   * make a reader wonder which one is wrong. Where a forecast exists, its sigma
   * wins, so the page states one number.
   */
  typicalMoveOverride: number | null = null,
): SessionExplanation | null {
  if (series.length < 2) return null;

  const latest = series[series.length - 1];
  const previous = series[series.length - 2];
  const history = series.slice(0, -1);

  const typical = typicalMoveOverride ?? typicalMovePct(latest.volatility30d);
  const move = latest.dailyReturn;
  const moveInTypicalMoves =
    move !== null && typical !== null && typical > 0 ? Math.abs(move) / typical : null;

  const observations = [
    magnitudeObservation(move, typical, moveInTypicalMoves),
    gapObservation(latest, previous, move),
    volumeObservation(latest, history),
    maCrossObservation(series),
    maTrendObservation(series),
    extremeObservation(series),
    streakObservation(series),
    rangeObservation(latest, previous, history),
  ]
    .filter((item): item is Observation => item !== null)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_OBSERVATIONS);

  return {
    date: latest.date,
    close: latest.close,
    previousClose: previous.close,
    dailyReturn: move,
    typicalMovePct: typical,
    moveInTypicalMoves,
    observations,
  };
}

/** How big the move was in units of this stock's own normal session. */
function magnitudeObservation(
  move: number | null,
  typical: number | null,
  inTypicalMoves: number | null,
): Observation | null {
  if (move === null || typical === null || inTypicalMoves === null) return null;

  const direction = move > 0 ? "gain" : "fall";

  if (inTypicalMoves >= 1.5) {
    return {
      id: "magnitude",
      text:
        `A ${signed(move)} ${direction} is ${ratio(inTypicalMoves)} this stock's typical ` +
        `session of ±${typical.toFixed(2)}%.`,
      // Anchored above the ordinary rules: when a move is genuinely outsized,
      // that is the first thing worth saying about the session.
      weight: 2 + inTypicalMoves,
    };
  }

  if (inTypicalMoves <= 0.4) {
    return {
      id: "magnitude",
      text: `A ${signed(move)} close is a quiet session — normal here is ±${typical.toFixed(2)}%.`,
      weight: 0.8,
    };
  }

  return {
    id: "magnitude",
    text: `A ${signed(move)} close is an ordinary session; normal here is ±${typical.toFixed(2)}%.`,
    weight: 1,
  };
}

/**
 * How much of the move arrived overnight rather than during the session.
 *
 * This is the single most useful split available from a daily bar. A move that
 * was fully priced at the open happened while the market was shut — an
 * earnings release, an overnight headline, a move in another timezone. A move
 * that built through the session is intraday flow. The two have genuinely
 * different explanations, and the open/prior-close gap separates them cleanly.
 */
function gapObservation(
  latest: SeriesPoint,
  previous: SeriesPoint,
  move: number | null,
): Observation | null {
  if (move === null || Math.abs(move) < FLAT_MOVE_PCT) return null;
  if (previous.close <= 0) return null;

  const gap = ((latest.open - previous.close) / previous.close) * 100;
  const share = Math.abs(gap) / Math.abs(move);

  // Only claim the gap explains the move when it points the same way as it.
  // A stock that gapped up and closed down did not "open where it finished" —
  // it reversed, which is the opposite story and is covered below.
  const sameDirection = Math.sign(gap) === Math.sign(move);

  if (sameDirection && share >= 0.6 && Math.abs(gap) >= FLAT_MOVE_PCT) {
    return {
      id: "gap",
      text:
        `It opened ${signed(gap)} against the previous close, so most of the move ` +
        `was set before the bell rather than during the session.`,
      weight: 2.4 + share,
    };
  }

  if (!sameDirection && Math.abs(gap) >= FLAT_MOVE_PCT) {
    return {
      id: "gap",
      text:
        `It opened ${signed(gap)} and closed ${signed(move)} — the session reversed ` +
        `the direction it started in.`,
      weight: 3,
    };
  }

  if (share <= 0.25) {
    return {
      id: "gap",
      text: `It opened near the previous close; the move built through the session.`,
      weight: 1.6,
    };
  }

  return null;
}

/** Turnover against its own recent norm — conviction behind the move. */
function volumeObservation(
  latest: SeriesPoint,
  history: SeriesPoint[],
): Observation | null {
  const window = history.slice(-BASELINE_WINDOW);
  if (window.length < MIN_BASELINE_SESSIONS) return null;

  const average = mean(window.map((point) => point.volume));
  if (average === null || average <= 0) return null;

  const multiple = latest.volume / average;

  if (multiple >= 1.5) {
    return {
      id: "volume",
      text: `Volume ran ${ratio(multiple)} its ${sessions(window.length)} average.`,
      weight: 1.5 + multiple,
    };
  }

  if (multiple <= 0.6) {
    return {
      id: "volume",
      text:
        `Volume was only ${ratio(multiple)} its ${sessions(window.length)} average — ` +
        `a thin session, so the move carries less weight than its size suggests.`,
      weight: 2,
    };
  }

  return null;
}

/** Whether the close changed sides on the 20-day average, and after how long. */
function maCrossObservation(series: SeriesPoint[]): Observation | null {
  const latest = series[series.length - 1];
  const previous = series[series.length - 2];
  if (latest.ma20 === null || previous.ma20 === null) return null;

  const above = latest.close > latest.ma20;
  const wasAbove = previous.close > previous.ma20;
  if (above === wasAbove) return null;

  // How long the old regime had held, so "crossed back above" carries the
  // weight of the run it ended rather than reading as routine noise.
  let held = 0;
  for (let index = series.length - 2; index >= 0; index -= 1) {
    const point = series[index];
    if (point.ma20 === null || (point.close > point.ma20) !== wasAbove) break;
    held += 1;
  }

  return {
    id: "ma-cross",
    text:
      `It closed back ${above ? "above" : "below"} its 20-day average, ending ` +
      `${sessions(held)} on the other side.`,
    weight: 2.2 + Math.min(held, 30) / 15,
  };
}

/** A 20/50 crossover in the last few sessions — the slower regime change. */
function maTrendObservation(series: SeriesPoint[]): Observation | null {
  const LOOKBACK = 5;
  const recent = series.slice(-(LOOKBACK + 1));
  if (recent.length < 2) return null;

  for (let index = recent.length - 1; index >= 1; index -= 1) {
    const point = recent[index];
    const prior = recent[index - 1];
    if (
      point.ma20 === null ||
      point.ma50 === null ||
      prior.ma20 === null ||
      prior.ma50 === null
    ) {
      continue;
    }

    const above = point.ma20 > point.ma50;
    if (above === (prior.ma20 > prior.ma50)) continue;

    const ago = recent.length - 1 - index;
    const when = ago === 0 ? "in this session" : `${sessions(ago)} ago`;
    return {
      id: "ma-trend",
      text: `The 20-day average crossed ${above ? "above" : "below"} the 50-day ${when}.`,
      weight: 2.6,
    };
  }

  return null;
}

/** Whether the close set a high or low for the whole lookback. */
function extremeObservation(series: SeriesPoint[]): Observation | null {
  if (series.length < 20) return null;

  const latest = series[series.length - 1];
  const history = series.slice(0, -1);
  const closes = history.map((point) => point.close);
  const highest = Math.max(...closes);
  const lowest = Math.min(...closes);

  if (latest.close > highest) {
    return {
      id: "extreme",
      text: `That is its highest close in the last ${sessions(series.length)}.`,
      weight: 2.7,
    };
  }
  if (latest.close < lowest) {
    return {
      id: "extreme",
      text: `That is its lowest close in the last ${sessions(series.length)}.`,
      weight: 2.7,
    };
  }
  return null;
}

/** A run of same-direction sessions, and what it added up to. */
function streakObservation(series: SeriesPoint[]): Observation | null {
  const latest = series[series.length - 1];
  if (latest.dailyReturn === null || latest.dailyReturn === 0) return null;

  const up = latest.dailyReturn > 0;
  let length = 0;
  for (let index = series.length - 1; index >= 0; index -= 1) {
    const value = series[index].dailyReturn;
    if (value === null || value === 0 || (value > 0) !== up) break;
    length += 1;
  }

  if (length < 3) return null;

  const start = series[series.length - length - 1];
  const cumulative =
    start && start.close > 0 ? ((latest.close - start.close) / start.close) * 100 : null;

  return {
    id: "streak",
    text:
      `${length} straight ${up ? "up" : "down"} sessions` +
      (cumulative === null ? "." : `, ${signed(cumulative)} over the run.`),
    weight: 1.4 + Math.min(length, 8) * 0.25,
  };
}

/** An unusually wide or narrow intraday range for the same close-to-close move. */
function rangeObservation(
  latest: SeriesPoint,
  previous: SeriesPoint,
  history: SeriesPoint[],
): Observation | null {
  const window = history.slice(-BASELINE_WINDOW);
  if (window.length < MIN_BASELINE_SESSIONS || previous.close <= 0) return null;

  const ranges = window
    .map((point, index) => {
      const prior = index === 0 ? null : window[index - 1];
      if (prior === null || prior.close <= 0) return null;
      return ((point.high - point.low) / prior.close) * 100;
    })
    .filter((value): value is number => value !== null);

  const average = mean(ranges);
  if (average === null || average <= 0) return null;

  const today = ((latest.high - latest.low) / previous.close) * 100;
  const multiple = today / average;

  if (multiple < 1.8) return null;

  return {
    id: "range",
    text:
      `It swung ${today.toFixed(2)}% between its high and low — ${ratio(multiple)} its ` +
      `usual intraday range.`,
    weight: 1.8 + multiple * 0.4,
  };
}

/**
 * Headlines published in the window that could plausibly bear on one session.
 *
 * The window runs from the evening before the session through the following
 * morning, in UTC. That span is chosen to cover the three things that move a
 * US close: news released after the previous session ended, news during the
 * session itself, and the coverage written in the hours immediately after —
 * which is often where a move is first described even though it reports on the
 * session that already happened.
 *
 * It is deliberately generous. A window tight enough to exclude every
 * irrelevant story would also exclude the relevant one whose timestamp is an
 * hour off, and the UI presents these as "what was being reported", not as the
 * cause — so a false positive costs a reader one skimmed headline, while a
 * false negative costs them the explanation entirely.
 */
const WINDOW_HOURS_BEFORE = 6;
const WINDOW_HOURS_AFTER = 30;

/**
 * Rank a headline by whether it actually names the company.
 *
 * Yahoo's per-ticker feed is loose — ask it about NVDA and a third of what
 * comes back is general market copy that happens to have been filed under the
 * symbol. Sorting purely by time therefore puts an Airbnb headline above the
 * Nvidia one, which makes the whole panel look broken even though every row is
 * in the right window.
 *
 * This is a *ranking* signal and deliberately not a filter. Sector news that
 * never says "Nvidia" ("Chip index drops for a third day") is often the real
 * context for a move, so it stays on the list — it just sits below the stories
 * that name the company outright.
 */
function relevance(title: string, ticker: string, company: string | null): number {
  const haystack = title.toLowerCase();

  // Word-bounded, so `V` does not match every headline containing the letter
  // and `KO` does not match "Kodak".
  const symbol = ticker.split(/[.-]/)[0].toLowerCase();
  if (symbol.length > 0 && new RegExp(`\\b${symbol}\\b`).test(haystack)) return 2;

  if (company !== null) {
    // The legal suffix is never how a headline refers to a company, and the
    // punctuation in "Alphabet Inc. (Class A)" would never match either.
    const head = company
      .toLowerCase()
      .replace(/\s*\(.*\)$/, "")
      .replace(/\b(inc|corp|corporation|co|plc|ag|nv|sa|ltd|holdings?|group)\b\.?/g, "")
      .replace(/[^a-z0-9\s&]/g, "")
      .trim();
    if (head.length >= 3 && haystack.includes(head)) return 1;
  }

  return 0;
}

export function headlinesAround(
  headlines: NewsHeadline[],
  sessionDate: string,
  { limit = 5, ticker, company = null }: { limit?: number; ticker: string; company?: string | null },
): NewsHeadline[] {
  const anchor = Date.parse(`${sessionDate}T00:00:00Z`);
  if (Number.isNaN(anchor)) return [];

  const start = anchor - WINDOW_HOURS_BEFORE * 3_600_000;
  const end = anchor + WINDOW_HOURS_AFTER * 3_600_000;

  return headlines
    .filter((item) => {
      const published = Date.parse(item.publishedAt);
      return !Number.isNaN(published) && published >= start && published <= end;
    })
    .map((item) => ({ item, score: relevance(item.title, ticker, company) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        Date.parse(b.item.publishedAt) - Date.parse(a.item.publishedAt),
    )
    .slice(0, limit)
    .map((entry) => entry.item);
}
