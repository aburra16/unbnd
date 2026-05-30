// Personalization endpoints (ADR 0014, Phase B). A signed-in sovereign user
// self-triggers their own GrapeRank calc: fetch a challenge, sign it with their
// own key (NIP-07, client-side), submit it. Provider-neutral — all backend
// specifics stay in the trust adapter.
import express, { type Request, type Router } from "express";
import { parse as parseCookie } from "cookie";
import type { SignedNostrEvent } from "@unbnd/schemas";
import type { TrustProvider } from "../trust";

const COOKIE_NAME = "session";

export type TrustSessionUser = {
  readonly id: string;
  readonly pubkeyHex: string;
  readonly tier: string;
};

export type TrustRouteDeps = {
  readonly sessionUser: (cookie: string | undefined) => Promise<TrustSessionUser | null>;
  readonly trust?: TrustProvider;
};

function cookieOf(req: Request): string | undefined {
  const header = req.headers.cookie;
  return header ? parseCookie(header)[COOKIE_NAME] : undefined;
}

export function buildTrustRouter(deps: TrustRouteDeps): Router {
  const router = express.Router();

  const requireUser = async (req: Request) => deps.sessionUser(cookieOf(req));

  // Does the signed-in user already have published trust scores?
  router.get("/api/trust/status", async (req, res, next) => {
    try {
      const user = await requireUser(req);
      if (!user) return void res.status(401).json({ error: { code: "no_session", message: "Not signed in." } });
      if (!deps.trust) return void res.status(200).json({ enabled: false, hasScores: false, canPersonalize: false });
      const canPersonalize = user.tier !== "custodial";
      const hasScores = await deps.trust.hasScores(user.pubkeyHex);
      res.status(200).json({ enabled: true, hasScores, canPersonalize });
    } catch (err) {
      next(err);
    }
  });

  // A challenge for the user to sign (sovereign self-trigger).
  router.get("/api/trust/challenge", async (req, res, next) => {
    try {
      const user = await requireUser(req);
      if (!user) return void res.status(401).json({ error: { code: "no_session", message: "Not signed in." } });
      if (!deps.trust) return void res.status(503).json({ error: { code: "feature_unavailable", message: "Trust is not configured." } });
      if (user.tier === "custodial") {
        return void res.status(400).json({ error: { code: "not_supported", message: "Personalization needs a Nostr key with a follow list." } });
      }
      const challenge = await deps.trust.authChallenge(user.pubkeyHex);
      if (!challenge) return void res.status(502).json({ error: { code: "challenge_failed", message: "Could not start personalization." } });
      res.status(200).json({ challenge });
    } catch (err) {
      next(err);
    }
  });

  // Verify the signed challenge + trigger the user's own calc.
  router.post("/api/trust/personalize", async (req, res, next) => {
    try {
      const user = await requireUser(req);
      if (!user) return void res.status(401).json({ error: { code: "no_session", message: "Not signed in." } });
      if (!deps.trust) return void res.status(503).json({ error: { code: "feature_unavailable", message: "Trust is not configured." } });
      if (user.tier === "custodial") {
        return void res.status(400).json({ error: { code: "not_supported", message: "Personalization needs a Nostr key with a follow list." } });
      }
      const event = (req.body ?? {}).event as SignedNostrEvent | undefined;
      if (!event || typeof event !== "object" || event.pubkey !== user.pubkeyHex) {
        return void res.status(400).json({ error: { code: "invalid_event", message: "Sign the challenge with your own key." } });
      }
      const ok = await deps.trust.personalize(user.pubkeyHex, event);
      if (!ok) return void res.status(502).json({ error: { code: "trigger_failed", message: "Could not start the calculation." } });
      res.status(200).json({ ok: true, building: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
