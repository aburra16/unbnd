// Failing tests for Story 52 (book blurbs from Open Library), per ADR 0051.
// These pin the contract for apps/seeder/src/description.ts (not yet written):
//   - sanitizeDescription(raw)  — pure cleaner
//   - capBlurb(text, max=700)   — pure back-jacket cap
//   - fetchWorkDescription(...) — network fetch + shape extraction
//   - BLURB_MAX_CHARS           — the pinned cap constant
// The Implementer turns these green. The module is loaded via an opaque
// specifier (see _load.ts) so the not-yet-existing module is a clean
// assertion-level red ("module not found") and not a tsc compile wall.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadSeederModule } from "./_load";

type DescriptionModule = {
  BLURB_MAX_CHARS: number;
  sanitizeDescription: (raw: string) => string;
  capBlurb: (text: string, max?: number) => string;
  fetchWorkDescription: (
    workId: string,
    opts: { fetchImpl?: typeof fetch; timeoutMs?: number; userAgent?: string },
  ) => Promise<string | null>;
};

const load = () => loadSeederModule<DescriptionModule>("description");

// --------------------------------------------------------------------------
// sanitizeDescription — the ADR's pure cleaner (rules applied in order).
// --------------------------------------------------------------------------
describe("sanitizeDescription", () => {
  it("normalizes Windows and bare-CR newlines to \\n", async () => {
    const { sanitizeDescription } = await load();
    expect(sanitizeDescription("Line one.\r\nLine two.\rLine three.")).toBe(
      "Line one.\nLine two.\nLine three.",
    );
  });

  it("strips inline Markdown reference-link footnote markers like ([source][1])", async () => {
    const { sanitizeDescription } = await load();
    const raw = "A novel about the sea ([source][1]) and its depths.";
    expect(sanitizeDescription(raw)).toBe("A novel about the sea and its depths.");
  });

  it("strips bare inline footnote refs like [1] and [source]", async () => {
    const { sanitizeDescription } = await load();
    const raw = "The hero returns home[1] after the war[source].";
    expect(sanitizeDescription(raw)).toBe("The hero returns home after the war.");
  });

  it("strips trailing reference-definition blocks like [1]: http://...", async () => {
    const { sanitizeDescription } = await load();
    const raw =
      "A quiet meditation on grief.\n\n[1]: http://example.com/citation\n[2]: https://openlibrary.org/x";
    expect(sanitizeDescription(raw)).toBe("A quiet meditation on grief.");
  });

  it("strips horizontal-rule separators (---- and ==== runs)", async () => {
    const { sanitizeDescription } = await load();
    const raw = "First part.\n----\nSecond part.\n====\nThird part.";
    expect(sanitizeDescription(raw)).toBe("First part.\nSecond part.\nThird part.");
  });

  it("strips residual markdown emphasis markers and inline backticks, keeping the text", async () => {
    const { sanitizeDescription } = await load();
    const raw = "It is **bold**, _italic_, *starred* and `code` prose.";
    expect(sanitizeDescription(raw)).toBe("It is bold, italic, starred and code prose.");
  });

  it("strips a clearly-delimited trailing Source: / From: attribution line", async () => {
    const { sanitizeDescription } = await load();
    const raw = "A sweeping family saga across three generations.\nSource: Wikipedia";
    expect(sanitizeDescription(raw)).toBe(
      "A sweeping family saga across three generations.",
    );
    const raw2 = "A sweeping family saga across three generations.\nFrom: Open Library";
    expect(sanitizeDescription(raw2)).toBe(
      "A sweeping family saga across three generations.",
    );
  });

  it("decodes the handful of HTML entities OL emits", async () => {
    const { sanitizeDescription } = await load();
    const raw = "Smith &amp; Jones, &quot;partners&quot; in 5 &lt; 6 &gt; 4, it&#39;s true.";
    expect(sanitizeDescription(raw)).toBe(
      'Smith & Jones, "partners" in 5 < 6 > 4, it\'s true.',
    );
  });

  it("collapses runs of blank lines and intra-line whitespace, then trims", async () => {
    const { sanitizeDescription } = await load();
    const raw = "   First paragraph.\n\n\n\nSecond    paragraph\twith   spaces.   ";
    expect(sanitizeDescription(raw)).toBe(
      "First paragraph.\n\nSecond paragraph with spaces.",
    );
  });

  it("does NOT over-strip ordinary prose: hyphens and non-footnote parentheticals survive", async () => {
    const { sanitizeDescription } = await load();
    const raw =
      "A coming-of-age tale (set in 1920s Paris) about a self-taught painter.";
    expect(sanitizeDescription(raw)).toBe(
      "A coming-of-age tale (set in 1920s Paris) about a self-taught painter.",
    );
  });

  it("cleans a real-world-messy OL description end to end", async () => {
    const { sanitizeDescription } = await load();
    const raw =
      "  *The Time Machine* is an 1895 novella by **H. G. Wells** ([source][1]).\r\n" +
      "It popularized the concept of time travel.\r\n" +
      "----\r\n" +
      "The protagonist is a Victorian scientist &amp; inventor.\n\n\n" +
      "Source: Wikipedia\n" +
      "[1]: https://en.wikipedia.org/wiki/The_Time_Machine\n";
    expect(sanitizeDescription(raw)).toBe(
      "The Time Machine is an 1895 novella by H. G. Wells.\n" +
        "It popularized the concept of time travel.\n" +
        "The protagonist is a Victorian scientist & inventor.",
    );
  });
});

// --------------------------------------------------------------------------
// capBlurb — the ADR's back-jacket cap (default BLURB_MAX_CHARS = 700).
// --------------------------------------------------------------------------
describe("capBlurb", () => {
  it("pins the cap constant at 700", async () => {
    const { BLURB_MAX_CHARS } = await load();
    expect(BLURB_MAX_CHARS).toBe(700);
  });

  it("returns text unchanged (no ellipsis) when at or under the cap", async () => {
    const { capBlurb } = await load();
    const text = "A short, complete blurb.";
    expect(capBlurb(text)).toBe(text);
    expect(capBlurb(text)).not.toContain("…");

    const exact = "a".repeat(700);
    expect(capBlurb(exact)).toBe(exact);
  });

  it("never returns a string longer than the cap, ellipsis included", async () => {
    const { capBlurb } = await load();
    const long = "word ".repeat(400); // ~2000 chars, all word boundaries
    const out = capBlurb(long);
    expect(out.length).toBeLessThanOrEqual(700);
    expect(out.endsWith("…")).toBe(true);
  });

  it("respects a custom max", async () => {
    const { capBlurb } = await load();
    const long = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda";
    const out = capBlurb(long, 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.endsWith("…")).toBe(true);
  });

  it("cuts at the last sentence terminator at/after ~60% of the window when one exists", async () => {
    const { capBlurb } = await load();
    // First sentence ends well past 60% of a 100-char window; a second
    // sentence overflows. The cut should land on the first sentence's period.
    const first =
      "The lighthouse keeper watched the storm roll in across the grey northern sea at dusk.";
    const text = `${first} Then everything changed forever and the village was never the same again afterwards.`;
    const out = capBlurb(text, 100);
    expect(out.startsWith(first)).toBe(true);
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out.endsWith("…")).toBe(true);
    // The terminator is preserved before the ellipsis, with no space between.
    expect(out).toContain("dusk.…");
  });

  it("falls back to a word boundary (never mid-word) when no sentence end is in range", async () => {
    const { capBlurb } = await load();
    const text =
      "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma";
    const out = capBlurb(text, 30);
    expect(out.length).toBeLessThanOrEqual(30);
    expect(out.endsWith("…")).toBe(true);
    // Strip the ellipsis; what remains must be whole words (no partial last word).
    const body = out.slice(0, -1).trimEnd();
    const sourceWords = text.split(" ");
    expect(text.startsWith(body)).toBe(true);
    expect(body.split(" ").every((w: string) => sourceWords.includes(w))).toBe(true);
  });

  it("appends a single U+2026 ellipsis, not three dots", async () => {
    const { capBlurb } = await load();
    const long = "word ".repeat(400);
    const out = capBlurb(long);
    expect(out.endsWith("…")).toBe(true);
    expect(out.endsWith("...")).toBe(false);
  });

  it("never produces a 'word, …' or 'word. …' artifact (no trailing space/punct before the ellipsis)", async () => {
    const { capBlurb } = await load();
    // A comma sits near the word-boundary cut point; the comma+space must be
    // trimmed so the result is `word…`, not `word, …`.
    const text =
      "one two three four five, six seven eight nine ten eleven twelve thirteen fourteen";
    const out = capBlurb(text, 28);
    expect(out.length).toBeLessThanOrEqual(28);
    expect(/[\s,;:.!?]…$/.test(out)).toBe(false);
    expect(out.endsWith("…")).toBe(true);
  });
});

// --------------------------------------------------------------------------
// fetchWorkDescription — the network fn (ADR: work-level, fail-open).
// --------------------------------------------------------------------------
describe("fetchWorkDescription", () => {
  const okResponse = (body: unknown): Response =>
    ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("extracts a plain-string description", async () => {
    const { fetchWorkDescription } = await load();
    const fetchImpl = vi.fn(async () =>
      okResponse({ description: "A plain string description." }),
    ) as unknown as typeof fetch;
    const out = await fetchWorkDescription("OL1W", { fetchImpl });
    expect(out).toBe("A plain string description.");
  });

  it("extracts the value from a { type, value } description object", async () => {
    const { fetchWorkDescription } = await load();
    const fetchImpl = vi.fn(async () =>
      okResponse({ description: { type: "/type/text", value: "The typed value." } }),
    ) as unknown as typeof fetch;
    const out = await fetchWorkDescription("OL2W", { fetchImpl });
    expect(out).toBe("The typed value.");
  });

  it("returns null when the description is absent", async () => {
    const { fetchWorkDescription } = await load();
    const fetchImpl = vi.fn(async () =>
      okResponse({ title: "No description here" }),
    ) as unknown as typeof fetch;
    const out = await fetchWorkDescription("OL3W", { fetchImpl });
    expect(out).toBeNull();
  });

  it("returns null for an empty / whitespace-only description", async () => {
    const { fetchWorkDescription } = await load();
    const fetchImpl = vi.fn(async () =>
      okResponse({ description: "   \n\t  " }),
    ) as unknown as typeof fetch;
    const out = await fetchWorkDescription("OL4W", { fetchImpl });
    expect(out).toBeNull();
  });

  it("fails open on an HTTP error (returns null, does not throw)", async () => {
    const { fetchWorkDescription } = await load();
    const fetchImpl = vi.fn(async () =>
      ({ ok: false, status: 500, json: async () => ({}) }) as unknown as Response,
    ) as unknown as typeof fetch;
    await expect(fetchWorkDescription("OL5W", { fetchImpl })).resolves.toBeNull();
  });

  it("fails open on a thrown network error (returns null, does not throw)", async () => {
    const { fetchWorkDescription } = await load();
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    await expect(fetchWorkDescription("OL6W", { fetchImpl })).resolves.toBeNull();
  });

  it("fails open on timeout via the AbortController bound (returns null)", async () => {
    const { fetchWorkDescription } = await load();
    // The fetch never resolves on its own; the function's timeout must abort it
    // and resolve null rather than hang or throw.
    const fetchImpl = vi.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    ) as unknown as typeof fetch;
    await expect(
      fetchWorkDescription("OL7W", { fetchImpl, timeoutMs: 10 }),
    ).resolves.toBeNull();
  });

  it("requests the work-detail JSON endpoint for the given work id", async () => {
    const { fetchWorkDescription } = await load();
    const fetchImpl = vi.fn(async () =>
      okResponse({ description: "x" }),
    ) as unknown as typeof fetch;
    await fetchWorkDescription("OL45804W", { fetchImpl });
    const mock = fetchImpl as unknown as ReturnType<typeof vi.fn>;
    const url = String(mock.mock.calls[0]![0]);
    expect(url).toContain("/works/OL45804W.json");
  });
});
