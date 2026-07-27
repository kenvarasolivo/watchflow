const COMPARISON = [
  {
    tone: "bad" as const,
    title: 'requests + User-Agent: "Chrome"',
    // Kept short enough to fit the narrowest card these render in; the panel
    // is a diagram, and a diagram that needs horizontal scrolling is a table.
    lines: ["TCP  ─────────▶", "TLS ClientHello (OpenSSL)", "  JA3: python-ish"],
    verdict: "429 Too Many Requests",
    note: "The User-Agent header is never even read — it travels inside the tunnel the handshake already lost.",
  },
  {
    tone: "good" as const,
    title: 'curl_cffi impersonate="chrome"',
    lines: ["TCP  ─────────▶", "TLS ClientHello (Chrome's)", "  JA3: real Chrome"],
    verdict: "200 OK",
    note: "Same datacenter IP, same request rate, no extra second of sleeping.",
  },
];

/**
 * The engineering note.
 *
 * This section exists because it is the only genuinely hard problem in the
 * project, and a landing page that led with "beautiful charts" would be
 * describing the easy half. It is also the one inverted surface in the app —
 * see the gain-inverse / loss-inverse tokens in globals.css.
 */
export function FingerprintNote() {
  return (
    <section className="bg-ink text-canvas">
      <div className="shell py-16 sm:py-24">
        {/* Not `.eyebrow`: that class hard-codes the muted ink colour, which is
            unreadable on this surface. */}
        <p className="num text-[0.6875rem] tracking-[0.18em] text-canvas/50 uppercase">
          Engineering note
        </p>
        <h2 className="display mt-3 max-w-3xl text-3xl text-canvas sm:text-4xl">
          The hard part wasn&rsquo;t the chart. It was the handshake.
        </h2>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-14">
          <div className="flex flex-col gap-5 text-base leading-relaxed text-canvas/70">
            <p>
              The extract step works perfectly from a laptop. Deploy the identical code to a CI
              runner and it starts returning <span className="num text-canvas">429</span> — often
              after the first few requests succeed, which is what makes it so misleading.
            </p>
            <p>
              Yahoo Finance doesn&rsquo;t fingerprint by request rate. Its edge reads the{" "}
              <span className="text-canvas">TLS ClientHello</span>: cipher order, extension order,
              curves, ALPN. Hashed, that is a JA3 fingerprint, and Python&rsquo;s TLS stack
              announces itself as plainly as a signed confession. Adding sleeps does nothing.
              Neither does a browser User-Agent — that header is application-layer data, sent{" "}
              <em className="text-canvas not-italic">after</em> the handshake the fingerprint was
              taken from.
            </p>
            <p>
              The fix is <span className="num text-canvas">curl_cffi</span>, which binds to a
              build of libcurl patched to reproduce a real browser&rsquo;s TLS and HTTP/2 stack
              exactly. The session is handed to yfinance rather than used alongside it, so the
              cookie negotiation travels the same transport as the history requests —
              impersonating on only some calls is worse than not impersonating at all.
            </p>
            <p className="text-canvas">
              And the pipeline refuses to fall back to plain <span className="num">requests</span>{" "}
              if <span className="num">curl_cffi</span> is missing. A silent fallback would work
              locally and fail in CI with an opaque 429 — rebuilding the exact dead end this
              section describes.
            </p>
          </div>

          {/* `self-start` so the two panels keep their natural height instead of
              stretching to match the prose column beside them. */}
          <ul className="grid gap-4 self-start sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {COMPARISON.map((column) => {
              const accent =
                column.tone === "good" ? "text-gain-inverse" : "text-loss-inverse";

              return (
                <li
                  key={column.title}
                  className="flex flex-col rounded-2xl border border-canvas/10 bg-canvas/5 p-5"
                >
                  <p className="num text-xs leading-relaxed break-words text-canvas">
                    {column.title}
                  </p>

                  <pre className="num mt-4 overflow-x-auto text-[0.6875rem] leading-relaxed whitespace-pre text-canvas/55">
                    {column.lines.join("\n")}
                  </pre>

                  <p className={`num mt-4 text-sm font-medium ${accent}`}>
                    <span aria-hidden="true">{column.tone === "good" ? "✓ " : "✕ "}</span>
                    {column.verdict}
                  </p>

                  <p className="mt-3 text-xs leading-relaxed text-canvas/55">{column.note}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
