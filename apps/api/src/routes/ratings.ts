// /api/ratings + /api/books/:slug/ratings routes. ADR 0005. Dependency-
// injected like buildAuthRouter so the endpoint suite runs with mocked
// session/publish/query. Handlers are added by the Implementer; this stub
// returns an empty router (every route 404s) so the route suite fails for
// the right reason during test design.
import express, { type Router } from "express";
import type { Config } from "../config";
import type { PublishResult } from "../nostr/publish";
import type { NostrFilter } from "../nostr/query";
import type { SignedNostrEvent } from "@unbnd/schemas";

export type SessionUser = {
  readonly id: string;
  readonly pubkeyHex: string;
  readonly tier: string;
};

export type RatingsDeps = {
  readonly config: Config;
  /** Resolve the signed-in user (with hex pubkey) from the session cookie. */
  readonly sessionUser: (cookie: string | undefined) => Promise<SessionUser | null>;
  readonly publish: (event: SignedNostrEvent) => Promise<PublishResult>;
  readonly query: (filter: NostrFilter) => Promise<SignedNostrEvent[]>;
};

export function buildRatingsRouter(_deps: RatingsDeps): Router {
  return express.Router();
}
