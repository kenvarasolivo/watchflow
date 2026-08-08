import type { NewsHeadline } from "@/db/queries";
import type { SessionExplanation } from "@/lib/attribution";
import { Delta } from "@/components/Delta";
import { formatDayMonth, formatPrice } from "@/lib/format";

/**
 * "What happened in this session", in two halves that are kept visibly apart.
 *
 * The split is the whole design. The left column is derived from the bars —
 * every line is arithmetic on data this app stored, and it is stated as fact.
 * The right column is headlines that were published around the same hours, and
 * it is labelled as exactly that. Interleaving them into one narrative would
 * quietly assert that the headline caused the move, which is a claim neither
 * half supports and which the reader would have no way to audit.
 *
 * The footnote is not boilerplate to be trimmed. It is the sentence that keeps
 * the section honest, and it sits inside the card rather than at the bottom of
 * the page so it cannot be read separately from the thing it qualifies.
 */
export function SessionExplainer({
  explanation,
  headlines,
  ticker,
}: {
  explanation: SessionExplanation | null;
  headlines: NewsHeadline[];
  ticker: string;
}) {
  if (explanation === null) {
    return null;
  }

  return (
    <section
      aria-labelledby="session-explainer-heading"
      className="rounded-2xl border border-hairline bg-canvas"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b border-hairline px-6 py-5">
        <div>
          <p className="eyebrow">Session breakdown</p>
          <h2 id="session-explainer-heading" className="display mt-1.5 text-xl text-ink">
            What happened on {formatDayMonth(explanation.date)}
          </h2>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="num text-lg font-medium text-ink">
            {formatPrice(explanation.close)}
          </span>
          <Delta value={explanation.dailyReturn} variant="pill" className="text-sm" />
        </div>
      </header>

      <div className="grid gap-px bg-hairline sm:grid-cols-2">
        <div className="bg-canvas px-6 py-5">
          <h3 className="eyebrow">In the data</h3>
          <ul className="mt-3 flex flex-col gap-2.5">
            {explanation.observations.map((observation) => (
              <li
                key={observation.id}
                className="flex gap-2.5 text-sm leading-relaxed text-ink-secondary"
              >
                {/* Marker rather than a list-style bullet so it aligns to the
                    first line's cap height across two- and three-line items. */}
                <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-baseline" />
                <span>{observation.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-canvas px-6 py-5">
          <h3 className="eyebrow">Reported around this session</h3>
          {headlines.length === 0 ? (
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              No headlines were collected for {ticker} in the hours around this session.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {headlines.map((headline) => (
                <li key={headline.articleId}>
                  <a
                    href={headline.link}
                    target="_blank"
                    // `noopener` closes the reverse-tab-nabbing hole on the
                    // opened page; `noreferrer` keeps the reader's path off the
                    // publisher's analytics.
                    rel="noopener noreferrer"
                    className="rounded text-sm leading-snug font-medium text-ink underline decoration-baseline underline-offset-4 transition-colors hover:decoration-leaf focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 focus-visible:outline-none"
                  >
                    {headline.title}
                  </a>
                  <p className="num mt-1 text-xs text-ink-muted">
                    {headline.publisher ?? "Unattributed"} ·{" "}
                    <time dateTime={headline.publishedAt}>
                      {formatHeadlineTime(headline.publishedAt)}
                    </time>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="border-t border-hairline px-6 py-4 text-xs leading-relaxed text-ink-muted">
        Headlines are listed because they were published in the hours around this session, not
        because they have been shown to have caused the move. The observations on the left are
        arithmetic on the stored bars and claim nothing beyond what they state.
      </p>
    </section>
  );
}

/** `2026-08-07T13:12:00Z` → `07 Aug 13:12 UTC`. */
function formatHeadlineTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}
