// Community submission write-path (ADR 0016, story 16a). Sovereign posts a
// client-signed { event }; custodial posts the intent and the server signs with
// the session's ephemeral-wrapped key. Records land in the `book-submissions`
// concept (separate from the canonical catalog). `GET /api/submissions/mine`
// lists the signed-in user's submissions. DI like the ratings/tags routers.
import express, { type Request, type Router } from "express";
import { parse as parseCookie } from "cookie";
import {
  buildBookSubmissionsHeaderAddress,
  fromBookRecordEvent,
  fromWireEvent,
  asHexPubkey,
  formatAddress,
  type SignedNostrEvent,
  type NostrEventTemplate,
} from "@unbnd/schemas";
import type { Config } from "../config";
import type { PublishResult } from "../nostr/publish";
import type { NostrFilter } from "../nostr/query";
import { tokenToId } from "../auth/sessions";
import { validateSignedEvent } from "../nostr/validate";
import { buildSubmissionTemplate, SubmissionError } from "../submissions/template";

const COOKIE_NAME = "session";
const KIND = 39999;

export type SubmissionsSessionUser = {
  readonly id: string;
  readonly pubkeyHex: string;
  readonly tier: string;
};

export type SubmissionsDeps = {
  readonly config: Config;
  readonly sessionUser: (cookie: string | undefined) => Promise<SubmissionsSessionUser | null>;
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

export function buildSubmissionsRouter(deps: SubmissionsDeps): Router {
  const router = express.Router();
  const conceptAddr = () =>
    deps.config.librarianPubkey
      ? formatAddress(buildBookSubmissionsHeaderAddress(asHexPubkey(deps.config.librarianPubkey)))
      : null;

  // Publish a submission. Sovereign → { event }; custodial → intent fields.
  router.post("/api/submissions", async (req, res, next) => {
    try {
      const cookie = cookieOf(req);
      const user = await deps.sessionUser(cookie);
      if (!user) return void res.status(401).json({ error: { code: "no_session", message: "Not signed in." } });

      if (user.tier === "custodial") {
        let template: NostrEventTemplate;
        try {
          template = buildSubmissionTemplate(
            deps.config,
            { ...req.body, submitterPubkey: user.pubkeyHex },
            Math.floor(Date.now() / 1000),
          );
        } catch (err) {
          if (err instanceof SubmissionError) {
            const status = err.code === "feature_unavailable" ? 503 : 400;
            return void res.status(status).json({ error: { code: err.code, message: err.message } });
          }
          throw err;
        }
        if (!deps.custodialSign) {
          return void res.status(501).json({ error: { code: "not_supported", message: "Custodial signing unavailable." } });
        }
        const sessionIdHex = cookie ? tokenToId(cookie).toString("hex") : "";
        const signed = await deps.custodialSign(sessionIdHex, template);
        if (!signed) {
          return void res.status(401).json({ error: { code: "reauth_required", message: "Please sign in again." } });
        }
        const published = await deps.publish(signed);
        if (!published.ok) {
          return void res.status(502).json({ error: { code: "publish_failed", message: "Could not publish." } });
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
            message: v.code === "pubkey_mismatch" ? "Must be signed by your own key." : "Invalid submission.",
          },
        });
      }
      const published = await deps.publish(event as SignedNostrEvent);
      if (!published.ok) {
        return void res.status(502).json({ error: { code: "publish_failed", message: "Could not publish." } });
      }
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // Build a template for the client to sign (sovereign).
  router.post("/api/submissions/template", async (req, res, next) => {
    try {
      const user = await deps.sessionUser(cookieOf(req));
      if (!user) return void res.status(401).json({ error: { code: "no_session", message: "Not signed in." } });
      const template = buildSubmissionTemplate(
        deps.config,
        { ...req.body, submitterPubkey: user.pubkeyHex },
        Math.floor(Date.now() / 1000),
      );
      res.status(200).json({ template });
    } catch (err) {
      if (err instanceof SubmissionError) {
        const status = err.code === "feature_unavailable" ? 503 : 400;
        return void res.status(status).json({ error: { code: err.code, message: err.message } });
      }
      next(err);
    }
  });

  // The signed-in user's own submissions.
  router.get("/api/submissions/mine", async (req, res, next) => {
    try {
      const user = await deps.sessionUser(cookieOf(req));
      if (!user) return void res.status(401).json({ error: { code: "no_session", message: "Not signed in." } });
      const addr = conceptAddr();
      const events = addr
        ? await deps.query({ kinds: [KIND], "#z": [addr], authors: [user.pubkeyHex] })
        : [];
      const submissions = events
        .map((e) => {
          try {
            const rec = fromBookRecordEvent(
              fromWireEvent({ kind: e.kind, content: e.content, tags: e.tags }) as never,
            );
            return {
              slug: rec.slug,
              title: rec.title,
              authorName: rec.authorName,
              isbn13: rec.isbn13,
              coverUrl: rec.coverUrl,
              publishYear: rec.publishYear,
              createdAt: e.created_at,
            };
          } catch {
            return null;
          }
        })
        .filter((s): s is NonNullable<typeof s> => s !== null)
        .sort((a, b) => b.createdAt - a.createdAt);
      res.status(200).json({ submissions });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
