// /api/profile/follow(/template) + /api/profile/follows/:target routes — the
// kind-3 contact-list write + the session-gated follow-status read (ADR 0023).
// Dependency-injected exactly like buildProfileSubstackRouter so the suite runs
// with mocked session/publish/fetchRaw/custodialSign.
//
// kind-3 is the user's WHOLE follow list (a single replaceable NIP-01 contact
// list). The write touches only the one target `p` tag and preserves every
// other tag (relay-hints, petnames, non-`p`) by merging into the freshest RAW
// kind-3 fetched at template-build / sign time. Propagation is the caller's
// `publish` (a kind-3 publisher that awaits the LOCAL relay and fans out to the
// profile relays fire-and-forget, NOT dcosl; ADR F2-A).
import express, { type Request, type Router } from "express";
import { parse as parseCookie } from "cookie";
import type { Config } from "../config";
import type { PublishResult } from "../nostr/publish";
import type { NostrEventTemplate, SignedNostrEvent } from "@unbnd/schemas";
import { tokenToId } from "../auth/sessions";
import { toHex } from "../nostr/npub";
import {
  mergeFollow,
  buildKind3Template,
  type FollowAction,
} from "../profile/follow-template";
import { validateSignedKind3 } from "../profile/validate-kind3";

const COOKIE_NAME = "session";

export type SessionUser = {
  readonly id: string;
  readonly pubkeyHex: string;
  readonly tier: string;
};

export type ProfileFollowDeps = {
  readonly config: Config;
  /** Resolve the signed-in user (with hex pubkey) from the session cookie. */
  readonly sessionUser: (cookie: string | undefined) => Promise<SessionUser | null>;
  /** kind-3 publisher: awaits the local relay; profile-relay fan-out is inside it. */
  readonly publish: (event: SignedNostrEvent) => Promise<PublishResult>;
  /** Fetch the freshest RAW kind-3 tags + content + created_at for a pubkey. */
  readonly fetchRaw: (
    pubkeyHex: string,
  ) => Promise<{ tags: string[][] | null; content: string; createdAt: number | null }>;
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

function parseAction(input: unknown): FollowAction {
  // The web only ever sends "follow" | "unfollow"; default to "follow" so a
  // missing/garbage hint never strips the list.
  return input === "unfollow" ? "unfollow" : "follow";
}

export function buildProfileFollowRouter(deps: ProfileFollowDeps): Router {
  const router = express.Router();

  // Sovereign: build the unsigned kind-3 template for the client to sign.
  router.post("/api/profile/follow/template", async (req, res, next) => {
    try {
      const user = await deps.sessionUser(readSessionCookie(req));
      if (!user) {
        res
          .status(401)
          .json({ error: { code: "no_session", message: "Not signed in." } });
        return;
      }

      const targetHex = toHex(String(req.body?.target ?? ""));
      if (!targetHex) {
        res.status(400).json({
          error: { code: "invalid_target", message: "That is not a valid pubkey." },
        });
        return;
      }
      if (targetHex === user.pubkeyHex) {
        res.status(400).json({
          error: { code: "self_follow", message: "You cannot follow yourself." },
        });
        return;
      }

      const action = parseAction(req.body?.action);
      const { tags, content, createdAt } = await deps.fetchRaw(user.pubkeyHex);
      const merged = mergeFollow(tags, targetHex, action);
      const template = buildKind3Template(merged, content, nextCreatedAt(createdAt));
      res.status(200).json({ template });
    } catch (err) {
      next(err);
    }
  });

  // Submit the kind-3 write. Sovereign posts a client-signed `{ event }` (plus a
  // redundant `{ target, action }` hint); custodial posts the intent
  // `{ target, action }` and the server signs via the ephemeral wrap. Anonymous
  // ⇒ 401. Branched by tier. 200 { following: action === "follow" } (optimistic
  // echo of the settled state, AC-8/Q6).
  router.post("/api/profile/follow", async (req, res, next) => {
    try {
      const cookie = readSessionCookie(req);
      const user = await deps.sessionUser(cookie);
      if (!user) {
        res
          .status(401)
          .json({ error: { code: "no_session", message: "Not signed in." } });
        return;
      }

      const action = parseAction(req.body?.action);

      if (user.tier === "custodial") {
        const targetHex = toHex(String(req.body?.target ?? ""));
        if (!targetHex) {
          res.status(400).json({
            error: { code: "invalid_target", message: "That is not a valid pubkey." },
          });
          return;
        }
        if (targetHex === user.pubkeyHex) {
          res.status(400).json({
            error: { code: "self_follow", message: "You cannot follow yourself." },
          });
          return;
        }

        const { tags, content, createdAt } = await deps.fetchRaw(user.pubkeyHex);
        const merged = mergeFollow(tags, targetHex, action);
        const template = buildKind3Template(merged, content, nextCreatedAt(createdAt));

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
              message: "Please sign in again to update your follows.",
            },
          });
          return;
        }
        const published = await deps.publish(signed);
        if (!published.ok) {
          res.status(502).json({
            error: {
              code: "publish_failed",
              message: "Could not publish your follow to the relay.",
            },
          });
          return;
        }
        res.status(200).json({ following: action === "follow" });
        return;
      }

      // Sovereign: validate the client-signed event. The hinted target guards
      // against a self-follow; the signed event is the source of truth on the wire.
      const { event } = req.body ?? {};
      const hintedTarget = toHex(String(req.body?.target ?? ""));
      if (hintedTarget && hintedTarget === user.pubkeyHex) {
        res.status(400).json({
          error: { code: "self_follow", message: "You cannot follow yourself." },
        });
        return;
      }

      const result = validateSignedKind3(event, user.pubkeyHex);
      if (!result.ok) {
        const status = result.code === "pubkey_mismatch" ? 403 : 400;
        res.status(status).json({
          error: {
            code: result.code,
            message:
              result.code === "pubkey_mismatch"
                ? "A follow update must be signed by your own key."
                : "The follow event could not be validated.",
          },
        });
        return;
      }

      const published = await deps.publish(event as SignedNostrEvent);
      if (!published.ok) {
        res.status(502).json({
          error: {
            code: "publish_failed",
            message: "Could not publish your follow to the relay.",
          },
        });
        return;
      }
      res.status(200).json({ following: action === "follow" });
    } catch (err) {
      next(err);
    }
  });

  // Follow-status: viewer-scoped, session-gated. Reads the VIEWER's freshest
  // kind-3 and returns whether a `p` tag for the resolved target exists. Self ⇒
  // { following: false } (you never follow yourself). No cache (viewer-scoped).
  router.get("/api/profile/follows/:target", async (req, res, next) => {
    try {
      const user = await deps.sessionUser(readSessionCookie(req));
      if (!user) {
        res
          .status(401)
          .json({ error: { code: "no_session", message: "Not signed in." } });
        return;
      }

      const targetHex = toHex(req.params.target);
      if (!targetHex) {
        res
          .status(404)
          .json({ error: { code: "not_found", message: "No such profile." } });
        return;
      }
      if (targetHex === user.pubkeyHex) {
        res.status(200).json({ following: false });
        return;
      }

      const { tags } = await deps.fetchRaw(user.pubkeyHex);
      const following = (tags ?? []).some(
        (t) => t[0] === "p" && t[1] === targetHex,
      );
      res.status(200).json({ following });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
