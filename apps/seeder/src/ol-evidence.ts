// Open Library evidence for the year rule (Story 104 / ADR 0093 §3): every
// edition year and the first author of a set of works, then those authors'
// names and birth years, from the search API in batches. An HTTP error throws,
// so a run never acts on partial evidence.
import { SEEDER_USER_AGENT } from "./fetch";
import { birthYearOf } from "./year";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type WorkEvidence = {
  readonly editionYears: readonly number[];
  readonly authorKey?: string;
};

export type AuthorEvidence = {
  readonly name?: string;
  readonly birthYear?: number;
};

export type EvidenceOpts = {
  readonly fetchImpl?: typeof fetch;
  readonly userAgent?: string;
  readonly batchSize?: number;
  readonly delayMs?: number;
};

type WorkDoc = {
  readonly key?: string;
  readonly publish_year?: readonly unknown[];
  readonly author_key?: readonly string[];
};
type AuthorDoc = { key?: string; name?: string; birth_date?: string };

/** Bare id from an Open Library key: `/works/OL1W` -> `OL1W`, `OL1A` -> `OL1A`. */
const bareKey = (key: string) => key.replace(/^\/?(works|authors)\//, "");

/**
 * Page `endpoint` with `q=key:("/<prefix>/A" OR ...)`, `batchSize` ids per
 * request, and hand each returned doc to `onDoc`.
 */
async function searchByKeys<D>(
  endpoint: string,
  prefix: "works" | "authors",
  fields: string,
  ids: readonly string[],
  opts: EvidenceOpts,
  onDoc: (doc: D) => void,
): Promise<void> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const batchSize = opts.batchSize ?? 100;
  const delayMs = opts.delayMs ?? 1000;
  const unique = [...new Set(ids.filter((id) => id))];

  for (let i = 0; i < unique.length; i += batchSize) {
    if (i > 0) await sleep(delayMs);
    const batch = unique.slice(i, i + batchSize);
    const params = new URLSearchParams({
      q: `key:(${batch.map((id) => `"/${prefix}/${id}"`).join(" OR ")})`,
      fields,
      limit: String(batch.length),
    });
    const res = await fetchImpl(`https://openlibrary.org/${endpoint}?${params.toString()}`, {
      headers: { "User-Agent": opts.userAgent ?? SEEDER_USER_AGENT },
    });
    if (!res.ok) throw new Error(`Open Library ${endpoint} (${prefix}): HTTP ${res.status}`);
    const body = (await res.json()) as { docs?: D[] };
    for (const doc of body.docs ?? []) onDoc(doc);
  }
}

/**
 * A search doc's year evidence: its distinct whole-number edition years, sorted,
 * and its first author's bare key. The seed and the repair both read docs
 * through this, so they judge from the same evidence (ADR 0093 §5).
 */
export function workEvidenceOf(doc: WorkDoc): WorkEvidence {
  const editionYears = [
    ...new Set((doc.publish_year ?? []).filter((y): y is number => Number.isInteger(y))),
  ].sort((a, b) => a - b);
  const authorKey = doc.author_key?.[0];
  return { editionYears, ...(authorKey ? { authorKey: bareKey(authorKey) } : {}) };
}

/** Each work's distinct edition years (sorted) and first author key. */
export async function fetchWorkEvidence(
  workIds: readonly string[],
  opts: EvidenceOpts = {},
): Promise<Map<string, WorkEvidence>> {
  const out = new Map<string, WorkEvidence>();
  await searchByKeys<WorkDoc>("search.json", "works", "key,publish_year,author_key", workIds, opts, (doc) => {
    if (doc.key) out.set(bareKey(doc.key), workEvidenceOf(doc));
  });
  return out;
}

/** Each author's name and birth year (when Open Library's birth date has one). */
export async function fetchAuthors(
  authorKeys: readonly string[],
  opts: EvidenceOpts = {},
): Promise<Map<string, AuthorEvidence>> {
  const out = new Map<string, AuthorEvidence>();
  await searchByKeys<AuthorDoc>("search/authors.json", "authors", "key,name,birth_date", authorKeys, opts, (doc) => {
    if (!doc.key) return;
    const birthYear = birthYearOf(doc.birth_date);
    out.set(bareKey(doc.key), {
      ...(doc.name !== undefined ? { name: doc.name } : {}),
      ...(birthYear !== undefined ? { birthYear } : {}),
    });
  });
  return out;
}
