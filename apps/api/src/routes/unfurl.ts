// The unfurl service (Story 72 / ADR 0070). Two read-only, public surfaces:
//   GET /unfurl/book/:slug   → a per-book OG/Twitter HTML card document. Caddy
//     reverse-proxies recognized social crawlers here; humans never reach it
//     (they keep the static SPA). Unknown slug → the generic site card (AC-6).
//   GET /api/oembed?url=...   → the oEmbed 1.0 JSON for a book URL (auto-
//     discovery). Same-origin validated (no SSRF); unknown slug → 404.
//
// DI like `homepage-shelves.ts`: the reads are injected so the route is unit-
// testable with no relay. RAW only — no trust seam is wired in, by construction.
//
// STUB (Test Design phase): signature is final; the router is empty so the red
// integration tests fail. Real handlers land in Implementation.
import express, { type Router } from "express";
import type { Config } from "../config";
import type { PublicBook } from "../books/effective";
import type { RawBookTags } from "../tags/aggregate";
import type { RawRatingSummary } from "../unfurl/card";

export type UnfurlDeps = {
  readonly config: Config;
  /** Reads the effective book for a slug, or null when there is no catalog book. */
  readonly readBook: (slug: string) => Promise<PublicBook | null>;
  /** Reads the RAW (viewer-independent) rating summary for a slug. */
  readonly readRawRatings: (slug: string) => Promise<RawRatingSummary>;
  /** Reads the RAW (viewer-independent) tag consensus for a slug. */
  readonly readRawTags: (slug: string) => Promise<RawBookTags>;
};

export function buildUnfurlRouter(_deps: UnfurlDeps): Router {
  const router = express.Router();
  // STUB — no routes yet (red).
  return router;
}
