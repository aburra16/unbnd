// Open Library search-API fetch (Story 55 / ADR 0054 §1). Replaces the
// subjects-API collect step (`fetchSubjectWorks`): one paginated call returns
// every gate signal inline. Pages `/search.json` with the decided request
// template, applies the legitimacy gate INSIDE the collect loop so paging stops
// at the real post-gate target (not a raw-count guess), and is bounded by
// `maxPages` so a pathological low-pass-rate genre cannot page forever. Polite
// User-Agent + inter-page delay are retained.
import { gateWork, type OLSearchDoc } from "./gate";
import { SEEDER_USER_AGENT } from "./fetch";

// Re-exported so index.ts gets the politeness UA and the pager from one import;
// the canonical definition stays in fetch.ts (also used by description.ts).
export { SEEDER_USER_AGENT };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** The lean field set the gate + mapper consume (ADR §1). */
const SEARCH_FIELDS = [
  "key",
  "title",
  "author_name",
  "author_key",
  "edition_count",
  "cover_i",
  "first_publish_year",
  "language",
  "number_of_pages_median",
  "readinglog_count",
  "ratings_count",
  "isbn",
  "subject",
].join(",");

type SearchResponse = { docs?: OLSearchDoc[] };

export type FetchSubjectSearchOpts = {
  readonly maxPages?: number;
  readonly pageSize?: number;
  readonly pageDelayMs?: number;
  readonly userAgent?: string;
  readonly currentYear?: number;
  readonly fetchImpl?: typeof fetch;
};

/**
 * Page the Open Library search API for `subject`, collecting up to `target`
 * post-gate passing docs. Each page is gated; only passers accumulate toward
 * `target`, and paging stops the moment the target is met or `maxPages` is hit.
 * Readership is the sort, never a cutoff. Returns the gated docs.
 */
export async function fetchSubjectSearch(
  subject: string,
  target: number,
  opts: FetchSubjectSearchOpts = {},
): Promise<readonly OLSearchDoc[]> {
  const maxPages = opts.maxPages ?? 60;
  const pageSize = opts.pageSize ?? 100;
  const pageDelayMs = opts.pageDelayMs ?? 1000;
  const userAgent = opts.userAgent ?? SEEDER_USER_AGENT;
  const currentYear = opts.currentYear ?? new Date().getUTCFullYear();
  const fetchImpl = opts.fetchImpl ?? fetch;

  const kept: OLSearchDoc[] = [];

  for (let page = 0; page < maxPages && kept.length < target; page++) {
    const params = new URLSearchParams({
      q: `subject:${subject} language:eng`,
      fields: SEARCH_FIELDS,
      sort: "readinglog",
      limit: String(pageSize),
      offset: String(page * pageSize),
    });
    const url = `https://openlibrary.org/search.json?${params.toString()}`;
    const res = await fetchImpl(url, { headers: { "User-Agent": userAgent } });
    if (!res.ok) {
      throw new Error(`Open Library search ${subject} @page ${page}: HTTP ${res.status}`);
    }
    const body = (await res.json()) as SearchResponse;
    const docs = body.docs ?? [];

    for (const doc of docs) {
      if (kept.length >= target) break;
      if (gateWork(doc, currentYear)) kept.push(doc);
    }

    if (docs.length === 0) break; // exhausted the subject (no more docs)
    if (kept.length < target) await sleep(pageDelayMs);
  }

  return kept;
}
