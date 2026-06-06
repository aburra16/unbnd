// Open Library metadata lookup endpoint (Story 64 / ADR 0063 §1–§2). A public,
// best-effort, always-200 proxy: `GET /api/ol/lookup?isbn=<isbn>` fetches OL
// `search.json` server-side with an injectable `fetchImpl`, normalizes the first
// doc to `{ found, title?, authorName?, coverUrl?, pageCount?, publishYear? }`
// (cover synthesized BY ISBN), bounded by a 5s AbortController timeout and a
// polite User-Agent. EVERY failure (bad isbn / OL down / non-2xx / parse-fail /
// timeout / no match) resolves to `200 { found: false }` — never a 5xx that
// could break the submission form. Mirrors the public-route + injected-deps
// posture of `search.ts` and the seeder's OL `search.json` call.
import express, { type Router } from "express";

/** A distinct, polite User-Agent so OL can tell the interactive lookup from the
 *  bulk seeder (which uses `SEEDER_USER_AGENT`). */
export const UNBND_API_USER_AGENT =
  "unbnd-api/0.1 (+https://unbnd.ink; submission metadata lookup)";

/** The OL timeout budget. A slow/hung OL aborts to `{ found: false }`. */
const OL_TIMEOUT_MS = 5000;

/** The five present fields Story 64 names (the seeder's set, narrowed). */
const OL_FIELDS = [
  "title",
  "author_name",
  "cover_i",
  "number_of_pages_median",
  "first_publish_year",
].join(",");

export type OlLookupResult = {
  found: boolean;
  title?: string;
  authorName?: string;
  coverUrl?: string;
  pageCount?: number;
  publishYear?: number;
};

type OlSearchDoc = {
  title?: string;
  author_name?: string[];
  cover_i?: number;
  number_of_pages_median?: number;
  first_publish_year?: number;
};

type OlSearchResponse = { docs?: OlSearchDoc[] };

/**
 * Normalize and validate the `isbn` query param (the same rule as
 * `DuplicateCheck.normalizeIsbn`): strip everything but digits and `X`, accept
 * only length 13 or 10, uppercase. Anything else → `null`.
 */
export function normalizeIsbnParam(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[^0-9Xx]/g, "").toUpperCase();
  return cleaned.length === 13 || cleaned.length === 10 ? cleaned : null;
}

/**
 * Map one OL `search.json` doc to the four-field metadata result, synthesizing
 * the cover URL BY ISBN. The four-field subset of the seeder's
 * `mapSearchDocToBookRecord` (same `?.trim()` / `typeof === "number"` guards),
 * minus the `BookRecord` wrapping. An absent doc → `{ found: false }`.
 */
export function normalizeDoc(doc: unknown, isbn: string): OlLookupResult {
  if (!doc || typeof doc !== "object") return { found: false };
  const d = doc as OlSearchDoc;
  const title = typeof d.title === "string" ? d.title.trim() : "";
  const authorName =
    Array.isArray(d.author_name) && typeof d.author_name[0] === "string"
      ? d.author_name[0].trim()
      : "";
  return {
    found: true,
    ...(title ? { title } : {}),
    ...(authorName ? { authorName } : {}),
    coverUrl: `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`,
    ...(typeof d.number_of_pages_median === "number"
      ? { pageCount: d.number_of_pages_median }
      : {}),
    ...(typeof d.first_publish_year === "number"
      ? { publishYear: d.first_publish_year }
      : {}),
  };
}

export function buildOlLookupRouter(
  deps: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Router {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? OL_TIMEOUT_MS;
  const router = express.Router();

  router.get("/api/ol/lookup", async (req, res) => {
    const isbn = normalizeIsbnParam(req.query.isbn);
    // Bad/missing isbn → no OL call, a usable empty response (never a 400).
    if (!isbn) {
      return void res.status(200).json({ found: false });
    }

    const params = new URLSearchParams({
      q: `isbn:${isbn}`,
      fields: OL_FIELDS,
      limit: "1",
    });
    const url = `https://openlibrary.org/search.json?${params.toString()}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const ol = await fetchImpl(url, {
        headers: { "User-Agent": UNBND_API_USER_AGENT },
        signal: controller.signal,
      });
      if (!ol.ok) {
        return void res.status(200).json({ found: false });
      }
      const body = (await ol.json()) as OlSearchResponse;
      const doc = body.docs?.[0];
      if (!doc) {
        return void res.status(200).json({ found: false });
      }
      res.status(200).json(normalizeDoc(doc, isbn));
    } catch {
      // OL unreachable / non-2xx body / parse-fail / abort/timeout — best-effort.
      res.status(200).json({ found: false });
    } finally {
      clearTimeout(timer);
    }
  });

  return router;
}
