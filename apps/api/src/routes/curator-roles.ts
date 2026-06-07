// Story 67/68 / ADR 0066/0067 — curator-role vouching. The gated write (a trusted
// user vouches/withdraws that a subject is a curator; self-vouch rejected) and the
// reads: `GET /api/profile/:id/curator` → { isCurator, vouchCount }, `GET
// /api/me/curator` → { isCurator, canVouch } (session), `GET /api/profile/:id/
// vouch-status` → { vouched } (session). Clones routes/author-verified.ts (write)
// + author-verified/verify.ts (count-gate, via curator-roles/status.ts).
import express, { type Request, type Router } from "express";
import { parse as parseCookie } from "cookie";
import {
  asHexPubkey,
  buildCuratorRolesHeaderAddress,
  formatAddress,
  fromCuratorRoleEvent,
  fromWireEvent,
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
import { trustedVouchCount } from "../curator-roles/status";

const KIND = 39999;
const COOKIE_NAME = "session";
const DEFAULT_MIN_ASSERTERS = 10;
type Polarity = 1 | -1;

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

export type CuratorStatusResponse = { readonly isCurator: boolean; readonly vouchCount: number };

function readSessionCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  return header ? parseCookie(header)[COOKIE_NAME] : undefined;
}

function actionPolarity(body: unknown): Polarity {
  return (body as { action?: string } | null)?.action === "withdraw" ? -1 : 1;
}

export function buildCuratorRolesRouter(deps: CuratorRolesDeps): Router {
  const router = express.Router();
  const threshold = () => deps.config.curatorThreshold ?? 0.5;
  const minAsserters = () => deps.config.curatorVouchMinAsserters ?? DEFAULT_MIN_ASSERTERS;
  const seedSet = () => new Set((deps.config.curatorSeedPubkeys ?? []).map((s) => s.toLowerCase()));
  const rolesZ = (lib: string) => formatAddress(buildCuratorRolesHeaderAddress(asHexPubkey(lib)));

  const houseWeightOf = async (callerHex: string): Promise<number> => {
    const house = deps.config.houseObserverPubkey;
    if (!deps.trust || !house) return 0;
    try {
      return (await deps.trust.weights(house, [callerHex])).get(callerHex) ?? 0;
    } catch {
      return 0;
    }
  };

  // The subject's #p-scoped vouch events (or [] when unconfigured / on failure).
  const readVouches = async (subjectHex: string, authorHex?: string): Promise<SignedNostrEvent[]> => {
    const lib = deps.config.librarianPubkey;
    if (!lib) return [];
    const filter: NostrFilter = { kinds: [KIND], "#z": [rolesZ(lib)], "#p": [subjectHex] };
    if (authorHex) (filter as { authors?: string[] }).authors = [authorHex];
    try {
      return await deps.query(filter);
    } catch {
      return [];
    }
  };

  function buildTemplate(asserterHex: string, subjectHex: string, polarity: Polarity): NostrEventTemplate {
    const lib = deps.config.librarianPubkey;
    if (!lib) throw new Error("curator-roles: librarian pubkey not configured");
    const assertion: CuratorRoleAssertion = {
      subjectPubkey: asHexPubkey(subjectHex),
      asserterPubkey: asHexPubkey(asserterHex),
      role: CURATOR_ROLE,
      polarity,
      parentHeader: buildCuratorRolesHeaderAddress(asHexPubkey(lib)),
    };
    return toWireTemplate(toCuratorRoleEvent(assertion), Math.floor(Date.now() / 1000));
  }

  // The asserter's latest polarity for the subject across the given events.
  function latestPolarity(events: SignedNostrEvent[], asserterHex: string, subjectHex: string): Polarity | null {
    let latest: { polarity: Polarity; at: number } | null = null;
    for (const e of events) {
      try {
        const a = fromCuratorRoleEvent(fromWireEvent({ kind: e.kind, content: e.content, tags: e.tags }) as never);
        if (e.pubkey !== asserterHex || a.subjectPubkey !== subjectHex) continue;
        if (!latest || e.created_at > latest.at) latest = { polarity: a.polarity, at: e.created_at };
      } catch {
        continue;
      }
    }
    return latest?.polarity ?? null;
  }

  // Defense-in-depth: a signed sovereign vouch must be a well-formed curator-role
  // assertion signed by the asserter, targeting a non-self subject (#67 follow-up).
  function validSovereignVouch(event: SignedNostrEvent | undefined, asserterHex: string): boolean {
    if (!event || event.pubkey !== asserterHex) return false;
    try {
      const a = fromCuratorRoleEvent(fromWireEvent({ kind: event.kind, content: event.content, tags: event.tags }) as never);
      return a.asserterPubkey === asserterHex && a.subjectPubkey !== asserterHex;
    } catch {
      return false;
    }
  }

  // GET /api/profile/:id/curator — { isCurator, vouchCount }: seed OR vouched OR emergent.
  router.get("/api/profile/:id/curator", async (req, res, next) => {
    try {
      const subjectHex = toHex(req.params.id);
      if (!subjectHex)
        return void res.status(404).json({ error: { code: "not_found", message: "No such profile." } });
      const house = deps.config.houseObserverPubkey;
      const floor = threshold();

      let vouchCount = 0;
      if (deps.trust && house && deps.config.librarianPubkey) {
        vouchCount = await trustedVouchCount(await readVouches(subjectHex), subjectHex, house, floor, deps.trust);
      }
      let isCurator = seedSet().has(subjectHex) || vouchCount >= minAsserters();
      if (!isCurator && deps.trust && house) {
        try {
          isCurator = ((await deps.trust.weights(house, [subjectHex])).get(subjectHex) ?? 0) >= floor;
        } catch {
          /* not emergent */
        }
      }
      res.status(200).json({ isCurator, vouchCount });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/me/curator — the session user's own status + vouch-eligibility.
  router.get("/api/me/curator", async (req, res, next) => {
    try {
      const user = await deps.sessionUser(readSessionCookie(req));
      if (!user)
        return void res.status(401).json({ error: { code: "no_session", message: "Not signed in." } });
      const canVouch = (await houseWeightOf(user.pubkeyHex)) >= threshold();
      let isCurator = seedSet().has(user.pubkeyHex) || canVouch; // canVouch == emergent
      if (!isCurator && deps.trust && deps.config.houseObserverPubkey && deps.config.librarianPubkey) {
        const count = await trustedVouchCount(
          await readVouches(user.pubkeyHex),
          user.pubkeyHex,
          deps.config.houseObserverPubkey,
          threshold(),
          deps.trust,
        );
        isCurator = count >= minAsserters();
      }
      res.status(200).json({ isCurator, canVouch });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/profile/:id/vouch-status — does the session user currently vouch this subject.
  router.get("/api/profile/:id/vouch-status", async (req, res, next) => {
    try {
      const user = await deps.sessionUser(readSessionCookie(req));
      if (!user)
        return void res.status(401).json({ error: { code: "no_session", message: "Not signed in." } });
      const subjectHex = toHex(req.params.id);
      if (!subjectHex)
        return void res.status(404).json({ error: { code: "not_found", message: "No such profile." } });
      const events = await readVouches(subjectHex, user.pubkeyHex);
      res.status(200).json({ vouched: latestPolarity(events, user.pubkeyHex, subjectHex) === 1 });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/curator-roles/template — gated vouch/withdraw template (sovereign signs it).
  router.post("/api/curator-roles/template", async (req, res, next) => {
    try {
      const user = await deps.sessionUser(readSessionCookie(req));
      if (!user)
        return void res.status(401).json({ error: { code: "no_session", message: "Not signed in." } });
      const subjectHex = typeof req.body?.subject === "string" ? toHex(req.body.subject) : null;
      if (!subjectHex)
        return void res.status(400).json({ error: { code: "bad_subject", message: "A valid subject is required." } });
      if (subjectHex === user.pubkeyHex)
        return void res.status(400).json({ error: { code: "self_vouch", message: "You cannot vouch for yourself." } });
      if ((await houseWeightOf(user.pubkeyHex)) < threshold())
        return void res.status(403).json({ error: { code: "below_gate", message: "Not a trusted curator." } });
      res.status(200).json({ template: buildTemplate(user.pubkeyHex, subjectHex, actionPolarity(req.body)) });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/curator-roles — tier-branched submit.
  router.post("/api/curator-roles", async (req, res, next) => {
    try {
      const cookie = readSessionCookie(req);
      const user = await deps.sessionUser(cookie);
      if (!user)
        return void res.status(401).json({ error: { code: "no_session", message: "Not signed in." } });
      if ((await houseWeightOf(user.pubkeyHex)) < threshold())
        return void res.status(403).json({ error: { code: "below_gate", message: "Not a trusted curator." } });
      if (!deps.publish)
        return void res.status(503).json({ error: { code: "feature_unavailable", message: "Vouching is not configured." } });

      if (user.tier === "custodial") {
        const subjectHex = typeof req.body?.subject === "string" ? toHex(req.body.subject) : null;
        if (!subjectHex || subjectHex === user.pubkeyHex)
          return void res.status(400).json({ error: { code: "bad_subject", message: "A valid, non-self subject is required." } });
        if (!deps.custodialSign)
          return void res.status(501).json({ error: { code: "not_supported", message: "Custodial signing is unavailable." } });
        const sessionIdHex = cookie ? tokenToId(cookie).toString("hex") : "";
        const signed = await deps.custodialSign(sessionIdHex, buildTemplate(user.pubkeyHex, subjectHex, actionPolarity(req.body)));
        if (!signed)
          return void res.status(401).json({ error: { code: "reauth_required", message: "Please sign in again." } });
        const published = await deps.publish(signed);
        if (!published.ok)
          return void res.status(502).json({ error: { code: "publish_failed", message: "Could not publish the vouch." } });
        return void res.status(200).json({ ok: true });
      }

      const event = req.body?.event as SignedNostrEvent | undefined;
      if (!validSovereignVouch(event, user.pubkeyHex))
        return void res.status(400).json({ error: { code: "invalid_vouch", message: "The vouch could not be validated." } });
      const published = await deps.publish(event!);
      if (!published.ok)
        return void res.status(502).json({ error: { code: "publish_failed", message: "Could not publish the vouch." } });
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
