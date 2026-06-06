// Story 66 / ADR 0065 — GET /api/books/:slug/taste-matches. Observer-relative,
// read-time (never cached): for the SIGNED-IN viewer, returns the taste match
// against each of the book's raters, keyed by npub. Two bounded reads (the
// book's raters via #a, then ONE batched author-scoped read over
// [viewer, ...raters]), grouped in memory (scoresByAuthor) and run through the
// reused computeTasteMatch — the For-You pattern, never N+1. Signed out →
// { signedIn:false }. Best-effort: a read failure degrades to empty matches.
//
// STUB (red): the real reads + per-rater compute land in implementation.
import express, { type Router } from "express";
import type { Config } from "../config";
import type { NostrFilter, PagedResult } from "../nostr/query";
import type { SignedNostrEvent } from "@unbnd/schemas";

export type BookTasteMatchesSessionUser = {
  readonly id: string;
  readonly pubkeyHex: string;
  readonly tier: string;
};

export type BookTasteMatchesDeps = {
  readonly config: Config;
  readonly sessionUser: (
    cookie: string | undefined,
  ) => Promise<BookTasteMatchesSessionUser | null>;
  readonly query: (filter: NostrFilter) => Promise<SignedNostrEvent[]>;
  readonly queryPaged: (filter: NostrFilter) => Promise<PagedResult>;
};

export type BylineMatch = {
  readonly commonBooks: number;
  readonly thresholdMet: boolean;
  readonly percentage?: number;
};

export type BookTasteMatchesResponse =
  | { readonly signedIn: false }
  | { readonly signedIn: true; readonly matches: Record<string, BylineMatch> };

export function buildBookTasteMatchesRouter(_deps: BookTasteMatchesDeps): Router {
  const router = express.Router();
  router.get("/api/books/:slug/taste-matches", async (_req, res) => {
    res.status(501).json({ error: "not implemented" });
  });
  return router;
}
