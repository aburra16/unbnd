// Personalization endpoints (ADR 0014, Phase B; ADR 0026 custodial branch). A
// signed-in user self-triggers their own GrapeRank calc. Sovereign: fetch the
// server-built challenge template, NIP-07-sign it client-side, submit. Custodial
// (ADR 0026): post nothing — the server re-checks the follow gate, fetches the
// template via the provider, signs it with the session's ephemeral-wrapped key,
// and triggers. Provider-neutral — all backend specifics stay in the adapter.
import express, { type Request, type Router } from "express";
import { parse as parseCookie } from "cookie";
import type { NostrEventTemplate, SignedNostrEvent } from "@unbnd/schemas";
import { tokenToId } from "../auth/sessions";
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
  /** Carries `personalizeMinFollows` (the custodial follow gate, ADR 0026). */
  readonly config?: { readonly personalizeMinFollows?: number };
  /** Distinct kind-3 follow count for the gate (the session user's own). */
  readonly followCount?: (pubkeyHex: string) => Promise<number>;
  /** Server-sign a template with the session's ephemeral key; null when the wrap is gone. */
  readonly custodialSign?: (
    sessionIdHex: string,
    template: NostrEventTemplate,
  ) => Promise<SignedNostrEvent | null>;
};

function cookieOf(req: Request): string | undefined {
  const header = req.headers.cookie;
  return header ? parseCookie(header)[COOKIE_NAME] : undefined;
}

export function buildTrustRouter(deps: TrustRouteDeps): Router {
  const router = express.Router();

  const requireUser = async (req: Request) => deps.sessionUser(cookieOf(req));

  const minFollows = () => deps.config?.personalizeMinFollows ?? 0;
  const gateMet = async (pubkeyHex: string) =>
    deps.followCount ? (await deps.followCount(pubkeyHex)) >= minFollows() : false;

  // Does the signed-in user already have published trust scores?
  router.get("/api/trust/status", async (req, res, next) => {
    try {
      const user = await requireUser(req);
      if (!user) return void res.status(401).json({ error: { code: "no_session", message: "Not signed in." } });
      if (!deps.trust) return void res.status(200).json({ enabled: false, hasScores: false, canPersonalize: false });
      // Sovereign: any follow count (ADR 0026 gates custodial only). Custodial:
      // eligible only once the follow gate is met.
      const canPersonalize =
        user.tier === "custodial" ? await gateMet(user.pubkeyHex) : true;
      const hasScores = await deps.trust.hasScores(user.pubkeyHex);
      res.status(200).json({ enabled: true, hasScores, canPersonalize });
    } catch (err) {
      next(err);
    }
  });

  // The unsigned challenge TEMPLATE for the user to sign (sovereign self-trigger;
  // custodial symmetry/defense). Both tiers sign whatever the provider returns.
  router.get("/api/trust/challenge", async (req, res, next) => {
    try {
      const user = await requireUser(req);
      if (!user) return void res.status(401).json({ error: { code: "no_session", message: "Not signed in." } });
      if (!deps.trust) return void res.status(503).json({ error: { code: "feature_unavailable", message: "Trust is not configured." } });
      // Custodial below the gate: typed refusal (the old not_supported reject is
      // relaxed for eligible custodial at/above the gate).
      if (user.tier === "custodial" && !(await gateMet(user.pubkeyHex))) {
        return void res.status(403).json({ error: { code: "below_follow_gate", message: "Follow a few curators to personalize your view." } });
      }
      const template = await deps.trust.authChallenge(user.pubkeyHex);
      if (!template) return void res.status(502).json({ error: { code: "challenge_failed", message: "Could not start personalization." } });
      res.status(200).json({ template });
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
        // (1) re-check the follow gate (defense in depth — the UI hides it too).
        if (!(await gateMet(user.pubkeyHex))) {
          return void res.status(403).json({ error: { code: "below_follow_gate", message: "Follow a few curators to personalize your view." } });
        }
        // (2) fetch the unsigned template from the provider.
        const template = await deps.trust.authChallenge(user.pubkeyHex);
        if (!template) return void res.status(502).json({ error: { code: "challenge_failed", message: "Could not start personalization." } });
        // (3) server-sign it with the session's ephemeral-wrapped key. null ⇒
        // the wrap is gone (restart/eviction) → fail closed, never personalize.
        const cookie = cookieOf(req);
        const sessionIdHex = cookie ? tokenToId(cookie).toString("hex") : "";
        const signed = deps.custodialSign
          ? await deps.custodialSign(sessionIdHex, template)
          : null;
        if (!signed) {
          return void res.status(401).json({ error: { code: "reauth_required", message: "Please sign in again to personalize your view." } });
        }
        // (4) trigger the run.
        const ok = await deps.trust.personalize(user.pubkeyHex, signed);
        if (!ok) return void res.status(502).json({ error: { code: "trigger_failed", message: "Could not start the calculation." } });
        return void res.status(200).json({ ok: true, building: true });
      }

      // Sovereign (unchanged): the client posts a NIP-07-signed kind-27235.
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
