// /api/profile/substack(/template) routes — the first kind-0 profile write
// (ADR 0022). Dependency-injected exactly like buildRatingsRouter so the suite
// runs with mocked session/publish/fetchRaw/custodialSign.
//
// kind-0 is the user's WHOLE profile (a single replaceable NIP-01 metadata
// event). The write touches only `substack` and preserves every other field by
// merging into the freshest RAW kind-0 fetched at template-build / sign time.
// Propagation is the caller's `publish` (a kind-0 publisher that awaits the
// LOCAL relay and fans out to the profile relays fire-and-forget; ADR F2-A).
import express, { type Request, type Router } from "express";
import { parse as parseCookie } from "cookie";
import type { Config } from "../config";
import type { PublishResult } from "../nostr/publish";
import type { NostrEventTemplate, SignedNostrEvent } from "@unbnd/schemas";
import { tokenToId } from "../auth/sessions";
import {
  validateSubstackUrl,
  mergeSubstack,
  buildKind0Template,
  SubstackError,
} from "../profile/substack-template";
import { validateSignedKind0 } from "../profile/validate-kind0";

const COOKIE_NAME = "session";

export type SessionUser = {
  readonly id: string;
  readonly pubkeyHex: string;
  readonly tier: string;
  /** The DB displayName, threaded as the kind-0 name floor (ADR 0027, AC-7). */
  readonly displayName?: string;
};

export type ProfileSubstackDeps = {
  readonly config: Config;
  /** Resolve the signed-in user (with hex pubkey) from the session cookie. */
  readonly sessionUser: (cookie: string | undefined) => Promise<SessionUser | null>;
  /** kind-0 publisher: awaits the local relay; profile-relay fan-out is inside it. */
  readonly publish: (event: SignedNostrEvent) => Promise<PublishResult>;
  /** Fetch the freshest RAW kind-0 content + created_at for a pubkey. */
  readonly fetchRaw: (
    pubkeyHex: string,
  ) => Promise<{ content: Record<string, unknown> | null; createdAt: number | null }>;
  /**
   * Sign a template server-side for a custodial session, using that session's
   * ephemeral-wrapped key (ADR 0006). Returns null when the session has no live
   * key (post-restart / evicted) — the route maps that to 401 reauth_required.
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

/** created_at = now, bumped strictly past the fetched event so replacement wins. */
function nextCreatedAt(fetchedCreatedAt: number | null): number {
  const now = Math.floor(Date.now() / 1000);
  if (fetchedCreatedAt !== null && fetchedCreatedAt >= now) {
    return fetchedCreatedAt + 1;
  }
  return now;
}

export function buildProfileSubstackRouter(deps: ProfileSubstackDeps): Router {
  const router = express.Router();

  // Sovereign: build the unsigned kind-0 template for the client to sign.
  router.post("/api/profile/substack/template", async (req, res, next) => {
    try {
      const user = await deps.sessionUser(readSessionCookie(req));
      if (!user) {
        res
          .status(401)
          .json({ error: { code: "no_session", message: "Not signed in." } });
        return;
      }

      let url: string | "clear";
      try {
        url = validateSubstackUrl(req.body?.url);
      } catch (err) {
        if (err instanceof SubstackError) {
          res.status(400).json({ error: { code: err.code, message: err.message } });
          return;
        }
        throw err;
      }

      const { content, createdAt } = await deps.fetchRaw(user.pubkeyHex);
      const merged = mergeSubstack(content, url, user.displayName);
      const template = buildKind0Template(merged, nextCreatedAt(createdAt));
      res.status(200).json({ template });
    } catch (err) {
      next(err);
    }
  });

  // Submit the kind-0 write. Sovereign posts a client-signed `{ event }` (plus a
  // redundant `{ url }` hint); custodial posts the intent `{ url }` and the
  // server signs via the ephemeral wrap. Anonymous ⇒ 401. Branched by tier.
  router.post("/api/profile/substack", async (req, res, next) => {
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
        let url: string | "clear";
        try {
          url = validateSubstackUrl(req.body?.url);
        } catch (err) {
          if (err instanceof SubstackError) {
            res.status(400).json({ error: { code: err.code, message: err.message } });
            return;
          }
          throw err;
        }

        const { content, createdAt } = await deps.fetchRaw(user.pubkeyHex);
        const merged = mergeSubstack(content, url, user.displayName);
        const template = buildKind0Template(merged, nextCreatedAt(createdAt));

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
            error: {
              code: "reauth_required",
              message: "Please sign in again to update your profile.",
            },
          });
          return;
        }
        const published = await deps.publish(signed);
        if (!published.ok) {
          res.status(502).json({
            error: {
              code: "publish_failed",
              message: "Could not publish your profile to the relay.",
            },
          });
          return;
        }
        res.status(200).json({ substack: url === "clear" ? null : url });
        return;
      }

      // Sovereign: validate the client-signed event.
      const { event, url } = req.body ?? {};
      let expected: string | "clear";
      try {
        expected = validateSubstackUrl(url);
      } catch {
        // The redundant url hint may be absent/garbage on a sovereign submit;
        // the signed content is the source of truth, so don't fail on it here.
        expected = "clear";
      }
      const result = validateSignedKind0(event, user.pubkeyHex, expected);
      if (!result.ok) {
        const status = result.code === "pubkey_mismatch" ? 403 : 400;
        res.status(status).json({
          error: {
            code: result.code,
            message:
              result.code === "pubkey_mismatch"
                ? "A profile update must be signed by your own key."
                : "The profile event could not be validated.",
          },
        });
        return;
      }

      const published = await deps.publish(event as SignedNostrEvent);
      if (!published.ok) {
        res.status(502).json({
          error: {
            code: "publish_failed",
            message: "Could not publish your profile to the relay.",
          },
        });
        return;
      }

      // Echo the substack from the signed content (source of truth).
      let substack: string | null = null;
      try {
        const content = JSON.parse((event as SignedNostrEvent).content) as Record<
          string,
          unknown
        >;
        substack = typeof content.substack === "string" ? content.substack : null;
      } catch {
        substack = null;
      }
      res.status(200).json({ substack });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
