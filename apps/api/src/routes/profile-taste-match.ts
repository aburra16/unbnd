// Story 65 / ADR 0064 — GET /api/profile/:id/taste-match. Observer-relative,
// read-time (never cached, mirrors For-You): resolves the SIGNED-IN viewer from
// the session cookie, reads the viewer's and the target's ratings author-scoped,
// and returns the raw taste-match (computeTasteMatch). Signed out → no match;
// viewing your own profile → self. Best-effort: a read failure degrades to an
// honest empty match, never a 500.
//
// STUB (red): the real session-resolve + dual rating read + compute lands in
// implementation.
import express, { type Router } from "express";
import type { Config } from "../config";
import type { NostrFilter, PagedResult } from "../nostr/query";

export type TasteMatchSessionUser = {
  readonly id: string;
  readonly pubkeyHex: string;
  readonly tier: string;
};

export type TasteMatchDeps = {
  readonly config: Config;
  readonly sessionUser: (
    cookie: string | undefined,
  ) => Promise<TasteMatchSessionUser | null>;
  readonly queryPaged: (filter: NostrFilter) => Promise<PagedResult>;
};

export type TasteMatchResponse =
  | { readonly signedIn: false }
  | { readonly signedIn: true; readonly self: true }
  | {
      readonly signedIn: true;
      readonly self: false;
      readonly commonBooks: number;
      readonly thresholdMet: boolean;
      readonly percentage?: number;
    };

export function buildTasteMatchRouter(_deps: TasteMatchDeps): Router {
  const router = express.Router();
  router.get("/api/profile/:id/taste-match", async (_req, res) => {
    res.status(501).json({ error: "not implemented" });
  });
  return router;
}
