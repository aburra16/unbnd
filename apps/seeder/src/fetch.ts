// Open Library subjects API fetch (paginated, polite). ADR 0008.
import type { OLWork } from "./openlibrary";

/** Polite User-Agent for all Open Library requests. Single source of truth. */
export const SEEDER_USER_AGENT = "unbnd-seeder/0.1 (+https://unbnd.ink; catalog import)";
const UA = SEEDER_USER_AGENT;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type SubjectResponse = { works?: OLWork[] };

/**
 * Fetch up to `limit` works for an Open Library subject, paginating the
 * subjects API. Polite User-Agent + a delay between pages to not hammer the
 * source. Returns the collected works (deduping is the caller's job).
 */
export async function fetchSubjectWorks(
  subject: string,
  limit: number,
  pageDelayMs = 1000,
): Promise<OLWork[]> {
  const pageSize = 100;
  const out: OLWork[] = [];
  for (let offset = 0; offset < limit; offset += pageSize) {
    const url = `https://openlibrary.org/subjects/${encodeURIComponent(
      subject,
    )}.json?limit=${Math.min(pageSize, limit - offset)}&offset=${offset}`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) {
      throw new Error(`Open Library ${subject} @${offset}: HTTP ${res.status}`);
    }
    const body = (await res.json()) as SubjectResponse;
    const works = body.works ?? [];
    out.push(...works);
    if (works.length < pageSize) break; // exhausted the subject
    await sleep(pageDelayMs);
  }
  return out;
}
