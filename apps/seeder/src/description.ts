// Open Library work description -> a clean, back-jacket-length book blurb.
// ADR 0051. Three exports: two pure (sanitizeDescription, capBlurb) and one
// network (fetchWorkDescription, work-level, fail-open). The pure helpers are
// kept out of the I/O path so the seeder's mapper stays pure and testable.
import { SEEDER_USER_AGENT } from "./fetch";

/**
 * Blurb cap: ~320-340 words, a few full paragraphs. The detail page reveals the
 * complete description in-app via the Read more control (ADR 0052 §5), so the cap
 * carries the whole description for the large majority of works; a rare
 * book-length essay still gets a clean cut. Raised from 700 by ADR 0052.
 */
export const BLURB_MAX_CHARS = 2000;

/** The work-detail JSON shape we read (Open Library `/works/{id}.json`). */
export type OLWorkDetail = {
  description?: string | { type?: string; value?: string };
};

const HTML_ENTITIES: ReadonlyArray<readonly [RegExp, string]> = [
  [/&amp;/g, "&"],
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&quot;/g, '"'],
  [/&#39;/g, "'"],
];

/**
 * Clean a raw Open Library description into shelf-talker prose. Pure and
 * deterministic; rules applied in the ADR's pinned order. Favors clean prose
 * over byte-fidelity: cruft (footnote refs, reference blocks, rules, emphasis
 * markers, trailing source attributions) is stripped, ordinary prose
 * (hyphens, non-footnote parentheticals) is preserved.
 */
export function sanitizeDescription(raw: string): string {
  let text = raw;

  // 1. Normalize newlines.
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 2. Inline Markdown reference-link footnote markers, e.g. `([source][1])`.
  //    Remove the whole parenthesized ref, plus its surrounding space.
  text = text.replace(/ ?\(\[[^\]]+\]\[[^\]]+\]\)/g, "");

  // 3. Drop whole lines that are metadata, not prose. Done before the bare
  //    footnote-ref strip so a `[1]: http…` line still matches as a unit:
  //    reference-definition blocks, horizontal rules, and clearly-delimited
  //    trailing `Source:` / `From:` / `Contains:` attribution lines.
  text = text
    .split("\n")
    .filter(
      (line) =>
        !/^[ \t]*\[\d+\]:[ \t]*\S+/.test(line) && // [1]: http://example.com
        !/^[ \t]*[-=*_]{3,}[ \t]*$/.test(line) && // ---- / ==== rule
        !/^[ \t]*(?:Source|From|Contains):[ \t]*/i.test(line), // Source: Wikipedia
    )
    .join("\n");

  // 4. Bare inline footnote refs attached to a word, e.g. `home[1]`, `war[source]`.
  text = text.replace(/\[[^\]\n]+\](?!\()/g, "");

  // 5. Residual markdown emphasis markers and inline backticks (keep the text).
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1"); // **bold**
  text = text.replace(/__([^_]+)__/g, "$1"); // __bold__
  text = text.replace(/\*([^*\n]+)\*/g, "$1"); // *starred*
  text = text.replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?])/g, "$1$2"); // _italic_
  text = text.replace(/`([^`\n]+)`/g, "$1"); // `code`

  // 6. Decode the handful of HTML entities OL emits.
  for (const [pattern, replacement] of HTML_ENTITIES) {
    text = text.replace(pattern, replacement);
  }

  // 7. Collapse whitespace: intra-line runs of spaces/tabs to one space, drop
  //    now-empty lines (keeping at most one blank line between paragraphs),
  //    then trim.
  const lines = text.split("\n").map((line) => line.replace(/[ \t]+/g, " ").trim());
  const collapsed: string[] = [];
  for (const line of lines) {
    if (line === "" && collapsed[collapsed.length - 1] === "") continue;
    collapsed.push(line);
  }
  return collapsed.join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
}

const SENTENCE_TERMINATOR = /[.!?]["'”’)]?/g;

/**
 * Cap a blurb to back-jacket length. Pure and deterministic. Under the cap is
 * returned unchanged; over the cap is cut at the last sentence terminator
 * at/after ~60% of the window (the terminator is kept), else at the last word
 * boundary (never mid-word, trailing space/punctuation stripped). A single `…`
 * (U+2026) is appended. The result length (ellipsis included) never exceeds max.
 */
export function capBlurb(text: string, max: number = BLURB_MAX_CHARS): string {
  if (text.length <= max) return text;

  const ellipsis = "…";
  // Reserve one char for the ellipsis when choosing the cut point.
  const limit = max - ellipsis.length;
  const window = text.slice(0, limit);

  // Sentence boundary first: the last terminator at/after ~60% of the window.
  const minSentenceEnd = Math.floor(limit * 0.6);
  let cut = -1;
  for (let m = SENTENCE_TERMINATOR.exec(window); m; m = SENTENCE_TERMINATOR.exec(window)) {
    const end = m.index + m[0].length;
    if (end >= minSentenceEnd) cut = end;
  }
  SENTENCE_TERMINATOR.lastIndex = 0;

  let body: string;
  if (cut >= minSentenceEnd) {
    // Sentence boundary: keep the terminator, drop only trailing whitespace so
    // we get `sentence.…`, not `sentence. …`.
    body = window.slice(0, cut).replace(/\s+$/, "");
  } else {
    // Word-boundary fallback: cut at the last whitespace, never mid-word, then
    // drop any trailing whitespace/punctuation so we never emit `word, …`.
    const lastSpace = window.lastIndexOf(" ");
    body = (lastSpace > 0 ? window.slice(0, lastSpace) : window).replace(
      /[\s,;:.!?]+$/,
      "",
    );
  }

  return `${body}${ellipsis}`;
}

export type WorkDescriptionOpts = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  userAgent?: string;
};

/**
 * The discriminated fetch result. `ok` separates a successful response (whose
 * `raw` is the description string, or null for a genuine no-description) from a
 * failure (HTTP non-200, network error, or timeout). The caller uses this to
 * cache a genuine null but NOT cache a transient failure. ADR 0051 Decision 5.
 */
export type WorkDescriptionResult =
  | { ok: true; raw: string | null }
  | { ok: false };

function extractDescription(body: OLWorkDetail): string | null {
  const { description } = body;
  const raw =
    typeof description === "string"
      ? description
      : description && typeof description === "object"
        ? (description.value ?? null)
        : null;
  if (raw === null) return null;
  return raw.trim().length > 0 ? raw : null;
}

/**
 * Fetch a work's description from Open Library, distinguishing a genuine
 * no-description from a transient failure. Work-level only
 * (`/works/{id}.json`), AbortController-bounded. Never throws.
 */
export async function requestWorkDescription(
  workId: string,
  opts: WorkDescriptionOpts = {},
): Promise<WorkDescriptionResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 8000;
  const userAgent = opts.userAgent ?? SEEDER_USER_AGENT;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`https://openlibrary.org/works/${workId}.json`, {
      headers: { "User-Agent": userAgent },
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false };
    const body = (await res.json()) as OLWorkDetail;
    return { ok: true, raw: extractDescription(body) };
  } catch {
    // HTTP/network/timeout failure: transient, the caller will not cache it.
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a work's description from Open Library. Work-level only
 * (`/works/{id}.json`). Returns the RAW description string, or null when the
 * description is absent / empty / whitespace-only. Fail-open: an HTTP error, a
 * thrown network error, or an AbortController timeout all resolve to null
 * (never throw), so a seed run is never aborted by a single bad fetch.
 */
export async function fetchWorkDescription(
  workId: string,
  opts: WorkDescriptionOpts = {},
): Promise<string | null> {
  const result = await requestWorkDescription(workId, opts);
  return result.ok ? result.raw : null;
}
