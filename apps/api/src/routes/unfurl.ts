// The unfurl service (Story 72 / ADR 0070). Two read-only, public surfaces:
//   GET /unfurl/book/:slug   → a per-book OG/Twitter HTML card document. Caddy
//     reverse-proxies recognized social crawlers here; humans never reach it
//     (they keep the static SPA). Unknown slug → the generic site card (AC-6).
//   GET /api/oembed?url=...   → the oEmbed 1.0 JSON for a book URL (auto-
//     discovery). Same-origin validated (no SSRF); unknown slug → 404.
//
// DI like `homepage-shelves.ts`: the reads are injected so the route is unit-
// testable with no relay. RAW only — no trust seam is wired in, by construction.
// The absolute origin comes from `config.publicOrigin` (already wired in prod).
import express, { type Router } from "express";
import type { Config } from "../config";
import type { PublicBook } from "../books/effective";
import type { RawBookTags } from "../tags/aggregate";
import {
  buildBookCard,
  renderGenericHtml,
  renderUnfurlHtml,
  toOEmbed,
  type RawRatingSummary,
} from "../unfurl/card";

export type UnfurlDeps = {
  readonly config: Config;
  /** Reads the effective book for a slug, or null when there is no catalog book. */
  readonly readBook: (slug: string) => Promise<PublicBook | null>;
  /** Reads the RAW (viewer-independent) rating summary for a slug. */
  readonly readRawRatings: (slug: string) => Promise<RawRatingSummary>;
  /** Reads the RAW (viewer-independent) tag consensus for a slug. */
  readonly readRawTags: (slug: string) => Promise<RawBookTags>;
};

/** Parse the book slug out of a same-origin `/book/:slug` URL, or null if the
 * URL is unparseable, a foreign origin, or not a `/book/` path (no SSRF: we only
 * ever parse the slug, we never fetch the URL). */
function bookSlugFromUrl(rawUrl: string, origin: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return null;
  }
  if (parsed.origin !== originUrl.origin) return null;
  const match = parsed.pathname.match(/^\/book\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]!) : null;
}

export function buildUnfurlRouter(deps: UnfurlDeps): Router {
  const router = express.Router();
  const origin = () => deps.config.publicOrigin;

  // Assemble the full card for a slug (book + raw rating + raw tags), or null
  // when there is no catalog book. RAW reads only — never a trust call.
  async function cardFor(slug: string) {
    const book = await deps.readBook(slug);
    if (!book) return null;
    const [raw, tags] = await Promise.all([deps.readRawRatings(slug), deps.readRawTags(slug)]);
    return buildBookCard(book, raw, tags, origin());
  }

  // The per-book HTML card document (crawlers only; humans keep the SPA via
  // Caddy). Unknown slug or any read error → the generic site card (AC-6), never
  // a fabricated book card and never a thrown error to the crawler.
  router.get("/unfurl/book/:slug", async (req, res) => {
    try {
      const card = await cardFor(req.params.slug);
      const html = card ? renderUnfurlHtml(card, origin()) : renderGenericHtml(origin());
      res.status(200).type("html").send(html);
    } catch {
      res.status(200).type("html").send(renderGenericHtml(origin()));
    }
  });

  // The oEmbed 1.0 JSON endpoint (auto-discovery). Validates the `url` is a
  // same-origin `/book/:slug` (else 400 — no SSRF), supports `json` only
  // (xml → 501), and 404s a well-formed url whose slug has no catalog book.
  router.get("/api/oembed", async (req, res, next) => {
    try {
      const url = typeof req.query.url === "string" ? req.query.url : "";
      const slug = url ? bookSlugFromUrl(url, origin()) : null;
      if (!slug) {
        return void res.status(400).json({ error: { code: "bad_request", message: "url must be a book URL on this site." } });
      }
      const format = typeof req.query.format === "string" ? req.query.format : "json";
      if (format !== "json") {
        return void res.status(501).json({ error: { code: "unsupported_format", message: "Only json is supported." } });
      }
      const card = await cardFor(slug);
      if (!card) {
        return void res.status(404).json({ error: { code: "not_found", message: "No such book." } });
      }
      const maxwidth = Number.parseInt(String(req.query.maxwidth ?? ""), 10);
      const maxheight = Number.parseInt(String(req.query.maxheight ?? ""), 10);
      res.status(200).json(
        toOEmbed(card, {
          maxwidth: Number.isFinite(maxwidth) ? maxwidth : undefined,
          maxheight: Number.isFinite(maxheight) ? maxheight : undefined,
        }),
      );
    } catch (err) {
      next(err);
    }
  });

  return router;
}
