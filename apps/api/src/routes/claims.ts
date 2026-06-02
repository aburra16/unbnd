// /api/claims write route (Story 31 / ADR 0032 §1). A new DI'd router mirroring
// buildRatingsRouter: the same template→sign→submit (sovereign) and
// template→custodialSign→publish (custodial) two-tier path, no new crypto.
// Claiming is OPEN (CLAUDE.md invariant 2): the write is gated on a session ONLY,
// never on trust/role/verification. The librarian secret is NEVER involved — the
// author signs their own claim. On success the route reads the book's claimant set
// back by `#a` (npub-out, hex never on the wire) so the badge updates.
import express, { type Request, type Router } from "express";
import { parse as parseCookie } from "cookie";
import { buildBookClaimsHeaderAddress, asHexPubkey, type NostrEventTemplate, type SignedNostrEvent } from "@unbnd/schemas";
import type { Config } from "../config";
import type { PublishResult } from "../nostr/publish";
import type { NostrFilter } from "../nostr/query";
import { tokenToId } from "../auth/sessions";
import { buildClaimTemplate, ClaimError } from "../claims/template";
import { validateSignedClaim } from "../claims/validate";
import { projectClaimants } from "../claims/claimants";

const COOKIE_NAME = "session";
const BOOK_CLAIM_KIND = 39999;

export type ClaimsSessionUser = {
  readonly id: string;
  readonly pubkeyHex: string;
  readonly tier: string;
};

export type ClaimsDeps = {
  readonly config: Config;
  readonly sessionUser: (cookie: string | undefined) => Promise<ClaimsSessionUser | null>;
  readonly publish: (event: SignedNostrEvent) => Promise<PublishResult>;
  readonly query: (filter: NostrFilter) => Promise<SignedNostrEvent[]>;
  /**
   * Sign a template server-side for a custodial session, using that session's
   * ephemeral-wrapped key (ADR 0006). null → 401 reauth_required.
   */
  readonly custodialSign?: (
    sessionIdHex: string,
    template: NostrEventTemplate,
  ) => Promise<SignedNostrEvent | null>;
};

function readSessionCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  return parseCookie(header)[COOKIE_NAME];
}

function bookAddress(config: Config, slug: string): string | null {
  if (!config.librarianPubkey) return null;
  return `${BOOK_CLAIM_KIND}:${config.librarianPubkey}:${slug}`;
}

export function buildClaimsRouter(deps: ClaimsDeps): Router {
  const router = express.Router();
  const claimsConcept = () =>
    deps.config.librarianPubkey
      ? `39998:${asHexPubkey(deps.config.librarianPubkey)}:${buildBookClaimsHeaderAddress(asHexPubkey(deps.config.librarianPubkey)).dTag}`
      : null;

  async function readClaimants(bookSlug: string) {
    const addr = bookAddress(deps.config, bookSlug);
    const concept = claimsConcept();
    if (!addr || !concept) return [];
    const events = await deps.query({
      kinds: [BOOK_CLAIM_KIND],
      "#z": [concept],
      "#a": [addr],
    });
    return projectClaimants(events);
  }

  // Build the unsigned template for the client (sovereign) to sign.
  router.post("/api/claims/template", async (req, res, next) => {
    try {
      const user = await deps.sessionUser(readSessionCookie(req));
      if (!user) {
        res.status(401).json({ error: { code: "no_session", message: "Not signed in." } });
        return;
      }
      const { bookSlug } = req.body ?? {};
      const template = buildClaimTemplate(
        deps.config,
        { claimantPubkey: user.pubkeyHex, bookSlug },
        Math.floor(Date.now() / 1000),
      );
      res.status(200).json({ template });
    } catch (err) {
      if (err instanceof ClaimError) {
        const status = err.code === "feature_unavailable" ? 503 : 400;
        res.status(status).json({ error: { code: err.code, message: err.message } });
        return;
      }
      next(err);
    }
  });

  // Publish a claim. Sovereign sessions post a client-signed `{ event }`;
  // custodial sessions post `{ bookSlug }` and the server signs it with the
  // session's ephemeral-wrapped key (ADR 0006). Branched by tier.
  router.post("/api/claims", async (req, res, next) => {
    try {
      const cookie = readSessionCookie(req);
      const user = await deps.sessionUser(cookie);
      if (!user) {
        res.status(401).json({ error: { code: "no_session", message: "Not signed in." } });
        return;
      }

      if (user.tier === "custodial") {
        const { bookSlug } = req.body ?? {};
        let template;
        try {
          template = buildClaimTemplate(
            deps.config,
            { claimantPubkey: user.pubkeyHex, bookSlug },
            Math.floor(Date.now() / 1000),
          );
        } catch (err) {
          if (err instanceof ClaimError) {
            const status = err.code === "feature_unavailable" ? 503 : 400;
            res.status(status).json({ error: { code: err.code, message: err.message } });
            return;
          }
          throw err;
        }
        if (!deps.custodialSign) {
          res.status(501).json({
            error: { code: "not_supported", message: "Custodial signing is unavailable." },
          });
          return;
        }
        const sessionIdHex = cookie ? tokenToId(cookie).toString("hex") : "";
        const signed = await deps.custodialSign(sessionIdHex, template);
        if (!signed) {
          res.status(401).json({
            error: { code: "reauth_required", message: "Please sign in again to claim." },
          });
          return;
        }
        const published = await deps.publish(signed);
        if (!published.ok) {
          res.status(502).json({
            error: { code: "publish_failed", message: "Could not publish the claim to the relay." },
          });
          return;
        }
        const claimants = await readClaimants(bookSlug);
        res.status(200).json({ claimed: true, claimants });
        return;
      }

      const { event } = req.body ?? {};
      const result = validateSignedClaim(event, user.pubkeyHex);
      if (!result.ok) {
        const status = result.code === "pubkey_mismatch" ? 403 : 400;
        res.status(status).json({
          error: {
            code: result.code,
            message:
              result.code === "pubkey_mismatch"
                ? "A claim must be signed by your own key."
                : "The claim event could not be validated.",
          },
        });
        return;
      }

      const published = await deps.publish(event as SignedNostrEvent);
      if (!published.ok) {
        res.status(502).json({
          error: { code: "publish_failed", message: "Could not publish the claim to the relay." },
        });
        return;
      }

      const claimants = await readClaimants(result.claim.bookSlug);
      res.status(200).json({ claimed: true, claimants });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
