// /api/shelves write/read routes (ADR 0018, Story 18). Mirrors routes/tags.ts.
// Sovereign client-signs the membership assertion; custodial server-signs via
// the session wrap. One `polarity` field drives add (1) and remove (-1). The
// /mine read is single-author, so POV-first does not apply. No public browse
// route here — that is Story 19.
import express, { type Request, type Router } from "express";
import { parse as parseCookie } from "cookie";
import type { Config } from "../config";
import type { PublishResult } from "../nostr/publish";
import type { NostrFilter } from "../nostr/query";
import type { SignedNostrEvent, NostrEventTemplate } from "@unbnd/schemas";
import { tokenToId } from "../auth/sessions";
import { validateSignedEvent } from "../nostr/validate";
import { buildShelfTemplate, ShelfError } from "../shelves/template";
import { groupOwnShelves } from "../shelves/aggregate";

const COOKIE_NAME = "session";
const KIND = 39999;

export type ShelvesSessionUser = {
  readonly id: string;
  readonly pubkeyHex: string;
  readonly tier: string;
};

export type ShelvesDeps = {
  readonly config: Config;
  readonly sessionUser: (
    cookie: string | undefined,
  ) => Promise<ShelvesSessionUser | null>;
  readonly publish: (event: SignedNostrEvent) => Promise<PublishResult>;
  readonly query: (filter: NostrFilter) => Promise<SignedNostrEvent[]>;
  readonly custodialSign?: (
    sessionIdHex: string,
    template: NostrEventTemplate,
  ) => Promise<SignedNostrEvent | null>;
};

function cookieOf(req: Request): string | undefined {
  const header = req.headers.cookie;
  return header ? parseCookie(header)[COOKIE_NAME] : undefined;
}

export function buildShelvesRouter(deps: ShelvesDeps): Router {
  const router = express.Router();
  const lib = () => deps.config.librarianPubkey;
  const shelvesConcept = () => `39998:${lib()}:book-shelves`;

  // Build a template for the client to sign (sovereign).
  router.post("/api/shelves/template", async (req, res, next) => {
    try {
      const user = await deps.sessionUser(cookieOf(req));
      if (!user)
        return void res
          .status(401)
          .json({ error: { code: "no_session", message: "Not signed in." } });
      const { bookSlug, shelfSlug, shelfName, polarity } = req.body ?? {};
      const template = buildShelfTemplate(
        deps.config,
        { ownerPubkey: user.pubkeyHex, bookSlug, shelfSlug, shelfName, polarity },
        Math.floor(Date.now() / 1000),
      );
      res.status(200).json({ template });
    } catch (err) {
      if (err instanceof ShelfError) {
        const status = err.code === "feature_unavailable" ? 503 : 400;
        return void res
          .status(status)
          .json({ error: { code: err.code, message: err.message } });
      }
      next(err);
    }
  });

  // Add/remove a book on a shelf. Sovereign posts {event}; custodial posts the
  // intent. The polarity field drives add (1) and remove (-1). A move across
  // default shelves is two of these calls (retract old, apply new) sequenced by
  // the web layer.
  router.post("/api/shelves", async (req, res, next) => {
    try {
      const cookie = cookieOf(req);
      const user = await deps.sessionUser(cookie);
      if (!user)
        return void res
          .status(401)
          .json({ error: { code: "no_session", message: "Not signed in." } });

      if (user.tier === "custodial") {
        const { bookSlug, shelfSlug, shelfName, polarity } = req.body ?? {};
        let template;
        try {
          template = buildShelfTemplate(
            deps.config,
            {
              ownerPubkey: user.pubkeyHex,
              bookSlug,
              shelfSlug,
              shelfName,
              polarity,
            },
            Math.floor(Date.now() / 1000),
          );
        } catch (err) {
          if (err instanceof ShelfError) {
            const status = err.code === "feature_unavailable" ? 503 : 400;
            return void res
              .status(status)
              .json({ error: { code: err.code, message: err.message } });
          }
          throw err;
        }
        if (!deps.custodialSign) {
          return void res.status(501).json({
            error: {
              code: "not_supported",
              message: "Custodial signing unavailable.",
            },
          });
        }
        const sessionIdHex = cookie ? tokenToId(cookie).toString("hex") : "";
        const signed = await deps.custodialSign(sessionIdHex, template);
        if (!signed) {
          return void res.status(401).json({
            error: { code: "reauth_required", message: "Please sign in again." },
          });
        }
        const published = await deps.publish(signed);
        if (!published.ok) {
          return void res.status(502).json({
            error: { code: "publish_failed", message: "Could not publish." },
          });
        }
        return void res.status(200).json({ ok: true });
      }

      // sovereign: client-signed event
      const { event } = req.body ?? {};
      const v = validateSignedEvent(event, user.pubkeyHex, KIND);
      if (!v.ok) {
        const status = v.code === "pubkey_mismatch" ? 403 : 400;
        return void res.status(status).json({
          error: {
            code: v.code,
            message:
              v.code === "pubkey_mismatch"
                ? "Must be signed by your own key."
                : "Invalid shelf event.",
          },
        });
      }
      const published = await deps.publish(event as SignedNostrEvent);
      if (!published.ok) {
        return void res.status(502).json({
          error: { code: "publish_failed", message: "Could not publish." },
        });
      }
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // The signed-in user's own shelves, grouped (AC-7). Single-author read.
  router.get("/api/shelves/mine", async (req, res, next) => {
    try {
      const user = await deps.sessionUser(cookieOf(req));
      if (!user)
        return void res
          .status(401)
          .json({ error: { code: "no_session", message: "Not signed in." } });
      if (!lib())
        return void res.status(503).json({
          error: {
            code: "feature_unavailable",
            message: "Shelves are not configured.",
          },
        });
      const events = await deps.query({
        kinds: [KIND],
        "#z": [shelvesConcept()],
        authors: [user.pubkeyHex],
      });
      res.status(200).json({ shelves: groupOwnShelves(events) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
