// Story 67 / ADR 0066 — curator-role vouching. The write (a trusted user vouches
// that a subject is a curator; gated to asserters above the weight floor, self-
// vouch rejected) and the read (`GET /api/profile/:id/curator` →
// { isCurator } = seed allowlist OR vouched count-gate OR emergent house-weight).
// Clones routes/author-verified.ts (write) + author-verified/verify.ts (gate).
//
// STUB (red): the real write + count-gate read land in implementation.
import express, { type Router } from "express";
import type { Config } from "../config";
import type { NostrFilter } from "../nostr/query";
import type { SignedNostrEvent } from "@unbnd/schemas";
import type { TrustProvider } from "../trust";

export type CuratorRolesSessionUser = {
  readonly id: string;
  readonly pubkeyHex: string;
  readonly tier: string;
};

export type CuratorRolesDeps = {
  readonly config: Config;
  readonly sessionUser: (
    cookie: string | undefined,
  ) => Promise<CuratorRolesSessionUser | null>;
  readonly query: (filter: NostrFilter) => Promise<SignedNostrEvent[]>;
  readonly trust?: TrustProvider;
};

export type CuratorStatusResponse = { readonly isCurator: boolean };

export function buildCuratorRolesRouter(_deps: CuratorRolesDeps): Router {
  const router = express.Router();
  router.get("/api/profile/:id/curator", async (_req, res) => {
    res.status(501).json({ error: "not implemented" });
  });
  router.post("/api/curator-roles/template", async (_req, res) => {
    res.status(501).json({ error: "not implemented" });
  });
  return router;
}
