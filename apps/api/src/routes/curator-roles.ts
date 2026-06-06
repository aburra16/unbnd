// Story 67 / ADR 0066 — curator-role vouching. The write (a trusted user vouches
// that a subject is a curator; gated to asserters above the weight floor, self-
// vouch rejected) and the read (`GET /api/profile/:id/curator` →
// { isCurator } = seed allowlist OR vouched count-gate OR emergent house-weight).
// Clones routes/author-verified.ts (write gate + tier-branched submit) +
// author-verified/verify.ts (count-gate, via curator-roles/status.ts).
import express, { type Request, type Router } from "express";
import { parse as parseCookie } from "cookie";
import {
  asHexPubkey,
  buildCuratorRolesHeaderAddress,
  formatAddress,
  toCuratorRoleEvent,
  toWireTemplate,
  CURATOR_ROLE,
  type CuratorRoleAssertion,
  type NostrEventTemplate,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type { Config } from "../config";
import type { PublishResult } from "../nostr/publish";
import type { NostrFilter } from "../nostr/query";
import type { TrustProvider } from "../trust";
import { tokenToId } from "../auth/sessions";
import { toHex } from "../nostr/npub";
import { computeCuratorStatus } from "../curator-roles/status";

const KIND = 39999;
const COOKIE_NAME = "session";
const DEFAULT_MIN_ASSERTERS = 10;

export type CuratorRolesSessionUser = {
  readonly id: string;
  readonly pubkeyHex: string;
  readonly tier: string;
};

export type CuratorRolesDeps = {
  readonly config: Config;
  readonly sessionUser: (
    cookie: string | undefined,
  ) => Promise<CuratorRolesSessionUser | null>;
  readonly query: (filter: NostrFilter) => Promise<SignedNostrEvent[]>;
  readonly trust?: TrustProvider;
  readonly publish?: (event: SignedNostrEvent) => Promise<PublishResult>;
  readonly custodialSign?: (
    sessionIdHex: string,
    template: NostrEventTemplate,
  ) => Promise<SignedNostrEvent | null>;
};

export type CuratorStatusResponse = { readonly isCurator: boolean };

function readSessionCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  return header ? parseCookie(header)[COOKIE_NAME] : undefined;
}

export function buildCuratorRolesRouter(deps: CuratorRolesDeps): Router {
  const router = express.Router();
  const threshold = () => deps.config.curatorThreshold ?? 0.5;
  const minAsserters = () => deps.config.curatorVouchMinAsserters ?? DEFAULT_MIN_ASSERTERS;

  // The caller's own house-PoV weight (ADR 0031). Any degrade → 0 → gate CLOSES.
  const houseWeightOf = async (callerHex: string): Promise<number> => {
    const house = deps.config.houseObserverPubkey;
    if (!deps.trust || !house) return 0;
    try {
      return (await deps.trust.weights(house, [callerHex])).get(callerHex) ?? 0;
    } catch {
      return 0;
    }
  };

  function buildTemplate(asserterHex: string, subjectHex: string): NostrEventTemplate {
    const lib = deps.config.librarianPubkey;
    if (!lib) throw new Error("curator-roles: librarian pubkey not configured");
    const assertion: CuratorRoleAssertion = {
      subjectPubkey: asHexPubkey(subjectHex),
      asserterPubkey: asHexPubkey(asserterHex),
      role: CURATOR_ROLE,
      polarity: 1,
      parentHeader: buildCuratorRolesHeaderAddress(asHexPubkey(lib)),
    };
    return toWireTemplate(toCuratorRoleEvent(assertion), Math.floor(Date.now() / 1000));
  }

  // GET /api/profile/:id/curator — seed OR vouched OR emergent.
  router.get("/api/profile/:id/curator", async (req, res, next) => {
    try {
      const subjectHex = toHex(req.params.id);
      if (!subjectHex)
        return void res
          .status(404)
          .json({ error: { code: "not_found", message: "No such profile." } });

      const seed = (deps.config.curatorSeedPubkeys ?? []).map((s) => s.toLowerCase());
      if (seed.includes(subjectHex))
        return void res.status(200).json({ isCurator: true });

      const house = deps.config.houseObserverPubkey;
      const floor = threshold();

      // Emergent fallback: the subject's own house weight clears the threshold.
      if (deps.trust && house) {
        try {
          const w = (await deps.trust.weights(house, [subjectHex])).get(subjectHex) ?? 0;
          if (w >= floor) return void res.status(200).json({ isCurator: true });
        } catch {
          /* fall through to the vouch read */
        }
      }

      // Vouched: the count-gate over this subject's curator-role assertions.
      let isCurator = false;
      const lib = deps.config.librarianPubkey;
      if (deps.trust && house && lib) {
        try {
          const z = formatAddress(buildCuratorRolesHeaderAddress(asHexPubkey(lib)));
          const events = await deps.query({ kinds: [KIND], "#z": [z], "#p": [subjectHex] });
          const out = await computeCuratorStatus(
            events,
            [subjectHex],
            house,
            floor,
            minAsserters(),
            deps.trust,
          );
          isCurator = out.includes(subjectHex);
        } catch {
          isCurator = false;
        }
      }
      res.status(200).json({ isCurator });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/curator-roles/template — gated vouch template (sovereign signs it).
  router.post("/api/curator-roles/template", async (req, res, next) => {
    try {
      const user = await deps.sessionUser(readSessionCookie(req));
      if (!user)
        return void res
          .status(401)
          .json({ error: { code: "no_session", message: "Not signed in." } });

      const subjectHex =
        typeof req.body?.subject === "string" ? toHex(req.body.subject) : null;
      if (!subjectHex)
        return void res
          .status(400)
          .json({ error: { code: "bad_subject", message: "A valid subject is required." } });
      if (subjectHex === user.pubkeyHex)
        return void res
          .status(400)
          .json({ error: { code: "self_vouch", message: "You cannot vouch for yourself." } });

      if ((await houseWeightOf(user.pubkeyHex)) < threshold())
        return void res
          .status(403)
          .json({ error: { code: "below_gate", message: "Not a trusted curator." } });

      res.status(200).json({ template: buildTemplate(user.pubkeyHex, subjectHex) });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/curator-roles — tier-branched submit (clones author-verified).
  router.post("/api/curator-roles", async (req, res, next) => {
    try {
      const cookie = readSessionCookie(req);
      const user = await deps.sessionUser(cookie);
      if (!user)
        return void res
          .status(401)
          .json({ error: { code: "no_session", message: "Not signed in." } });
      if ((await houseWeightOf(user.pubkeyHex)) < threshold())
        return void res
          .status(403)
          .json({ error: { code: "below_gate", message: "Not a trusted curator." } });
      if (!deps.publish)
        return void res
          .status(503)
          .json({ error: { code: "feature_unavailable", message: "Vouching is not configured." } });

      if (user.tier === "custodial") {
        const subjectHex =
          typeof req.body?.subject === "string" ? toHex(req.body.subject) : null;
        if (!subjectHex || subjectHex === user.pubkeyHex)
          return void res
            .status(400)
            .json({ error: { code: "bad_subject", message: "A valid, non-self subject is required." } });
        if (!deps.custodialSign)
          return void res
            .status(501)
            .json({ error: { code: "not_supported", message: "Custodial signing is unavailable." } });
        const sessionIdHex = cookie ? tokenToId(cookie).toString("hex") : "";
        const signed = await deps.custodialSign(sessionIdHex, buildTemplate(user.pubkeyHex, subjectHex));
        if (!signed)
          return void res
            .status(401)
            .json({ error: { code: "reauth_required", message: "Please sign in again." } });
        const published = await deps.publish(signed);
        if (!published.ok)
          return void res
            .status(502)
            .json({ error: { code: "publish_failed", message: "Could not publish the vouch." } });
        return void res.status(200).json({ ok: true });
      }

      // Sovereign: the asserter must have signed their own vouch.
      const event = req.body?.event as SignedNostrEvent | undefined;
      if (!event || event.pubkey !== user.pubkeyHex)
        return void res
          .status(403)
          .json({ error: { code: "pubkey_mismatch", message: "A vouch must be signed by your own key." } });
      const published = await deps.publish(event);
      if (!published.ok)
        return void res
          .status(502)
          .json({ error: { code: "publish_failed", message: "Could not publish the vouch." } });
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
