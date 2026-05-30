// Book-read API (ADR 0010): live catalog reads off the local relay. Read-only,
// public. Books are kind-39999 records z-tagged to the `books` concept,
// d-tag = slug.
import express, { type Router } from "express";
import {
  fromBookRecordEvent,
  fromWireEvent,
  type BookRecord,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type { Config } from "../config";
import type { NostrFilter } from "../nostr/query";

const KIND = 39999;
const DEFAULT_RECENT = 24;

/** The book fields the UI consumes — no hex, no parent header. */
export type PublicBook = Pick<
  BookRecord,
  | "slug"
  | "title"
  | "authorName"
  | "blurb"
  | "coverUrl"
  | "publishYear"
  | "pageCount"
  | "language"
  | "subjects"
  | "openLibraryId"
  | "isbn13"
  | "purchaseUrl"
  | "format"
>;

export type BooksDeps = {
  readonly config: Config;
  readonly query: (filter: NostrFilter) => Promise<SignedNostrEvent[]>;
};

function toPublicBook(record: BookRecord): PublicBook {
  return {
    slug: record.slug,
    title: record.title,
    authorName: record.authorName,
    blurb: record.blurb,
    coverUrl: record.coverUrl,
    publishYear: record.publishYear,
    pageCount: record.pageCount,
    language: record.language,
    subjects: record.subjects,
    openLibraryId: record.openLibraryId,
    isbn13: record.isbn13,
    purchaseUrl: record.purchaseUrl,
    format: record.format,
  };
}

export function parseBook(event: SignedNostrEvent): PublicBook | null {
  try {
    const unsigned = fromWireEvent({ kind: event.kind, content: event.content, tags: event.tags });
    return toPublicBook(fromBookRecordEvent(unsigned as never));
  } catch {
    return null;
  }
}

export function buildBooksRouter(deps: BooksDeps): Router {
  const router = express.Router();
  const lib = () => deps.config.librarianPubkey;
  const booksConcept = () => `39998:${lib()}:books`;

  router.get("/api/books/:slug", async (req, res, next) => {
    try {
      if (!lib()) {
        return void res.status(503).json({ error: { code: "feature_unavailable", message: "Catalog not configured." } });
      }
      const events = await deps.query({ kinds: [KIND], "#z": [booksConcept()], "#d": [req.params.slug] });
      const book = events.map(parseBook).find((b): b is PublicBook => b !== null);
      if (!book) {
        return void res.status(404).json({ error: { code: "not_found", message: "No such book." } });
      }
      res.status(200).json({ book });
    } catch (err) {
      next(err);
    }
  });

  router.get("/api/books", async (req, res, next) => {
    try {
      if (!lib()) {
        return void res.status(503).json({ error: { code: "feature_unavailable", message: "Catalog not configured." } });
      }
      const slugsParam = typeof req.query.slugs === "string" ? req.query.slugs : "";
      if (slugsParam) {
        const slugs = slugsParam.split(",").map((s) => s.trim()).filter(Boolean);
        const events = await deps.query({ kinds: [KIND], "#z": [booksConcept()], "#d": slugs });
        const bySlug = new Map<string, PublicBook>();
        for (const e of events) {
          const b = parseBook(e);
          if (b && !bySlug.has(b.slug)) bySlug.set(b.slug, b);
        }
        // Return in requested order, skipping any not found.
        const books = slugs.map((s) => bySlug.get(s)).filter((b): b is PublicBook => Boolean(b));
        return void res.status(200).json({ books });
      }
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || DEFAULT_RECENT));
      const events = await deps.query({ kinds: [KIND], "#z": [booksConcept()], limit });
      const books = events
        .slice()
        .sort((a, b) => b.created_at - a.created_at)
        .map(parseBook)
        .filter((b): b is PublicBook => b !== null)
        .slice(0, limit);
      res.status(200).json({ books });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
