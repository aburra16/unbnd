// POST /api/profile/display-name — the custodial display-name rename (Story 27b,
// ADR 0028). Mirrors `buildProfileSubstackRouter`'s tier-branched custodial-write
// DI shape and adds the `updateDisplayName` Postgres lockstep.
//
// kind-0 is the user's WHOLE profile (a single replaceable NIP-01 metadata
// event). The rename touches only `name`/`display_name` and preserves every
// other field by merging into the freshest RAW kind-0 via the shared
// `buildProfileKind0Content` seam (Story 27 / ADR 0027). No new merge logic, no
// new whitelist, no new template builder, no hand-rolled crypto: the server
// signs only via the injected `custodialSign`.
//
// Ordering (custodial branch, ADR 0028 §2): sessionUser → validateDisplayName →
// tier guard → fetchRaw → buildProfileKind0Content(prev, { displayName: D2 }, D2)
// → buildKind0Template(merged, nextCreatedAt(fetched)) → custodialSign → await
// publish(local) → updateDisplayName(user.id, D2) → 200 { displayName: D2 }.
// The target is ALWAYS the session user; there is no request-body user id.
import express, { type Request, type Router } from "express";
import { parse as parseCookie } from "cookie";
import type { Config } from "../config";
import type { PublishResult } from "../nostr/publish";
import type { NostrEventTemplate, SignedNostrEvent } from "@unbnd/schemas";
import { tokenToId } from "../auth/sessions";
import { validateDisplayName } from "../auth/passwords";
import { buildProfileKind0Content, buildKind0Template } from "../profile/kind0";

const COOKIE_NAME = "session";

export type SessionUser = {
  readonly id: string;
  readonly pubkeyHex: string;
  readonly tier: string;
  /** The DB displayName, the prefill seed + kind-0 name floor (ADR 0027). */
  readonly displayName?: string;
};

export type ProfileDisplayNameDeps = {
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
  /** Postgres lockstep: update the DB recovery/seed copy after a successful publish. */
  readonly updateDisplayName: (userId: string, name: string) => Promise<unknown>;
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

export function buildProfileDisplayNameRouter(deps: ProfileDisplayNameDeps): Router {
  const router = express.Router();

  router.post("/api/profile/display-name", async (req, res, next) => {
    try {
      const cookie = readSessionCookie(req);
      const user = await deps.sessionUser(cookie);
      if (!user) {
        res
          .status(401)
          .json({ error: { code: "no_session", message: "Not signed in." } });
        return;
      }

      // Validate before any I/O (AC-4).
      const displayName = req.body?.displayName as unknown;
      const validation = validateDisplayName(displayName as string);
      if (!validation.ok) {
        res.status(400).json({
          error: { code: "invalid_display_name", message: validation.message },
        });
        return;
      }
      const nextName = (displayName as string).trim();

      // Sovereign owns its own profile and signs its own kind-0 (AC-6).
      if (user.tier !== "custodial") {
        res.status(403).json({
          error: {
            code: "sovereign_self_signed",
            message: "Update your display name with your own nostr client.",
          },
        });
        return;
      }

      // Custodial rename: merge into the freshest raw kind-0 and republish.
      const { content, createdAt } = await deps.fetchRaw(user.pubkeyHex);
      const merged = buildProfileKind0Content(
        content,
        { displayName: nextName },
        nextName,
      );
      const template = buildKind0Template(merged, nextCreatedAt(createdAt));

      if (!deps.custodialSign) {
        res.status(401).json({
          error: {
            code: "reauth_required",
            message: "Please sign in again to update your profile.",
          },
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

      // Publish the canonical store first (ADR 0028 F1-A); DB follows.
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

      // Postgres lockstep, AFTER the canonical publish. A throw here leaves the
      // kind-0 live with the new name (canonical for display) and the DB stale;
      // the drift is bounded and self-limiting (ADR 0028 §3) and we surface 502.
      try {
        await deps.updateDisplayName(user.id, nextName);
      } catch {
        res.status(502).json({
          error: {
            code: "publish_failed",
            message: "Could not publish your profile to the relay.",
          },
        });
        return;
      }

      res.status(200).json({ displayName: nextName });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
