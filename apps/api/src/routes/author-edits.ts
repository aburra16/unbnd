// /api/author-edits write route (Story 32 / ADR 0033 §4). A DI'd router cloning the
// claims.ts two-tier path (sovereign template→sign→submit; custodial
// template→custodialSign→publish, no new crypto) WITH a verified-author gate: the
// session user must be the Verified author of THIS book (recompute
// computeVerification for (session, book) → must clear N). Server-enforced on both
// the template and the write. Only blurb / coverUrl / purchaseUrl are accepted;
// cover/purchase URLs are http(s)-validated.
import express, { type Request, type Router } from "express";
import { parse as parseCookie } from "cookie";
import {
  asHexPubkey,
  buildBookAuthorVerifiedHeaderAddress,
  type NostrEventTemplate,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type { Config } from "../config";
import type { PublishResult } from "../nostr/publish";
import type { NostrFilter } from "../nostr/query";
import type { TrustProvider } from "../trust";
import { tokenToId } from "../auth/sessions";
import { buildAuthorEditsTemplate, AuthorEditsError } from "../author-edits/template";
import { validateSignedAuthorOverlay } from "../author-edits/validate";
import { computeVerification } from "../author-verified/verify";

const COOKIE_NAME = "session";
const KIND = 39999;

export type AuthorEditsSessionUser = {
  readonly id: string;
  readonly pubkeyHex: string;
  readonly tier: string;
};

export type AuthorEditsDeps = {
  readonly config: Config;
  readonly sessionUser: (
    cookie: string | undefined,
  ) => Promise<AuthorEditsSessionUser | null>;
  readonly publish: (event: SignedNostrEvent) => Promise<PublishResult>;
  readonly query: (filter: NostrFilter) => Promise<SignedNostrEvent[]>;
  readonly trust?: TrustProvider;
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

export function buildAuthorEditsRouter(deps: AuthorEditsDeps): Router {
  const router = express.Router();

  const librarian = () =>
    deps.config.librarianPubkey
      ? asHexPubkey(deps.config.librarianPubkey)
      : null;

  // Is the session user the Verified author of this book? Reads the book's
  // author-verified assertions and runs the count-gate for (sessionUser, book).
  // Honest degrade (no librarian / no trust / throw) → not verified (AC-8).
  async function isVerifiedAuthor(
    sessionHex: string,
    bookSlug: string,
  ): Promise<boolean> {
    const lib = librarian();
    if (!lib || !deps.trust) return false;
    const bookAtag = `${KIND}:${lib}:${bookSlug}`;
    const verifiedConcept = `39998:${lib}:${buildBookAuthorVerifiedHeaderAddress(lib).dTag}`;
    let events: SignedNostrEvent[] = [];
    try {
      events = await deps.query({
        kinds: [KIND],
        "#z": [verifiedConcept],
        "#a": [bookAtag],
      });
    } catch {
      return false;
    }
    const floor = deps.config.curatorThreshold ?? 0.5;
    const n = deps.config.verifiedAuthorMinCurators ?? 2;
    const verified = await computeVerification(
      events,
      [sessionHex],
      deps.config.houseObserverPubkey,
      floor,
      n,
      deps.trust,
    );
    return verified.includes(sessionHex);
  }

  router.post("/api/author-edits/template", async (req, res, next) => {
    try {
      const user = await deps.sessionUser(readSessionCookie(req));
      if (!user) {
        res
          .status(401)
          .json({ error: { code: "no_session", message: "Not signed in." } });
        return;
      }
      const { bookSlug, blurb, coverUrl, purchaseUrl } = req.body ?? {};
      if (!(await isVerifiedAuthor(user.pubkeyHex, bookSlug))) {
        res.status(403).json({
          error: { code: "not_verified", message: "Only the verified author can edit this book." },
        });
        return;
      }
      const template = buildAuthorEditsTemplate(
        deps.config,
        { authorPubkey: user.pubkeyHex, bookSlug, blurb, coverUrl, purchaseUrl },
        Math.floor(Date.now() / 1000),
      );
      res.status(200).json({ template });
    } catch (err) {
      if (err instanceof AuthorEditsError) {
        const status = err.code === "feature_unavailable" ? 503 : 400;
        res.status(status).json({ error: { code: err.code, message: err.message } });
        return;
      }
      next(err);
    }
  });

  router.post("/api/author-edits", async (req, res, next) => {
    try {
      const cookie = readSessionCookie(req);
      const user = await deps.sessionUser(cookie);
      if (!user) {
        res
          .status(401)
          .json({ error: { code: "no_session", message: "Not signed in." } });
        return;
      }

      if (user.tier === "custodial") {
        const { bookSlug, blurb, coverUrl, purchaseUrl } = req.body ?? {};
        // Verified-author gate BEFORE signing (AC-5).
        if (!(await isVerifiedAuthor(user.pubkeyHex, bookSlug))) {
          res.status(403).json({
            error: { code: "not_verified", message: "Only the verified author can edit this book." },
          });
          return;
        }
        let template;
        try {
          template = buildAuthorEditsTemplate(
            deps.config,
            { authorPubkey: user.pubkeyHex, bookSlug, blurb, coverUrl, purchaseUrl },
            Math.floor(Date.now() / 1000),
          );
        } catch (err) {
          if (err instanceof AuthorEditsError) {
            const status = err.code === "feature_unavailable" ? 503 : 400;
            res
              .status(status)
              .json({ error: { code: err.code, message: err.message } });
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
            error: { code: "reauth_required", message: "Please sign in again." },
          });
          return;
        }
        const published = await deps.publish(signed);
        if (!published.ok) {
          res.status(502).json({
            error: { code: "publish_failed", message: "Could not publish the overlay." },
          });
          return;
        }
        res.status(200).json({ ok: true });
        return;
      }

      const { event } = req.body ?? {};
      const result = validateSignedAuthorOverlay(event, user.pubkeyHex);
      if (!result.ok) {
        const status = result.code === "pubkey_mismatch" ? 403 : 400;
        res.status(status).json({
          error: {
            code: result.code,
            message:
              result.code === "pubkey_mismatch"
                ? "An overlay must be signed by your own key."
                : "The overlay event could not be validated.",
          },
        });
        return;
      }

      // Verified-author gate on the write (AC-5).
      if (!(await isVerifiedAuthor(user.pubkeyHex, result.overlay.bookSlug))) {
        res.status(403).json({
          error: { code: "not_verified", message: "Only the verified author can edit this book." },
        });
        return;
      }

      const published = await deps.publish(event as SignedNostrEvent);
      if (!published.ok) {
        res.status(502).json({
          error: { code: "publish_failed", message: "Could not publish the overlay." },
        });
        return;
      }
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
