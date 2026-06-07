// Failing tests (red) for Story 68 / ADR 0067 — the vouch-UI reads.
// GET /api/me/curator → { isCurator, canVouch } (session). GET /api/profile/:id/curator
// gains vouchCount. GET /api/profile/:id/vouch-status → { vouched } (session). These
// endpoints/fields do not exist yet (404 / missing) → red.
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  asHexPubkey,
  toCuratorRoleEvent,
  CURATOR_ROLE,
  type CuratorRoleAssertion,
  type DListAddress,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type { Config } from "../../src/config";
import type { NostrFilter } from "../../src/nostr/query";
import { FixtureTrustProvider } from "../../src/trust/fixture";
import {
  buildCuratorRolesRouter,
  type CuratorRolesDeps,
  type CuratorRolesSessionUser,
} from "../../src/routes/curator-roles";

const LIB = "1".repeat(63) + "a";
const HOUSE = "b".repeat(64);
const EMERGENT = "e".repeat(64); // own house-weight ≥ threshold → curator + canVouch
const LOWUSER = "0".repeat(64); // no weight → not curator, cannot vouch
const SUBJECT = "7".repeat(64);
const A1 = "c".repeat(64);
const A2 = "d".repeat(64);
const HEADER: DListAddress<39998> = { kind: 39998, pubkey: asHexPubkey(LIB), dTag: "curator-roles" };

function trust() {
  return new FixtureTrustProvider({ weights: { [HOUSE]: { [EMERGENT]: 0.9, [A1]: 0.9, [A2]: 0.8 } } });
}

function vouch(asserter: string, subject: string): SignedNostrEvent {
  const a: CuratorRoleAssertion = {
    subjectPubkey: asHexPubkey(subject),
    asserterPubkey: asHexPubkey(asserter),
    role: CURATOR_ROLE,
    polarity: 1,
    parentHeader: HEADER,
  };
  const unsigned = toCuratorRoleEvent(a);
  const tags = [...unsigned.tags.map((t: readonly string[]) => [...t]), ["json", JSON.stringify(unsigned.payload)]];
  return {
    id: `${asserter.slice(0, 6)}-${subject.slice(0, 6)}`,
    pubkey: asserter,
    sig: "x",
    created_at: 100,
    kind: 39999,
    tags,
    content: "",
  } as unknown as SignedNostrEvent;
}

function baseConfig(over: Record<string, unknown> = {}): Config {
  return {
    librarianPubkey: LIB,
    houseObserverPubkey: HOUSE,
    curatorThreshold: 0.5,
    curatorVouchMinAsserters: 2,
    curatorSeedPubkeys: [],
    ...over,
  } as unknown as Config;
}

function makeApp(opts: { user?: CuratorRolesSessionUser | null; vouches?: SignedNostrEvent[] }) {
  const deps: CuratorRolesDeps = {
    config: baseConfig(),
    sessionUser: vi.fn(async () => opts.user ?? null),
    query: vi.fn(async (_f: NostrFilter) => opts.vouches ?? []),
    trust: trust(),
  };
  const app = express();
  app.use("/", buildCuratorRolesRouter(deps));
  return app;
}

const user = (hex: string): CuratorRolesSessionUser => ({ id: "u", pubkeyHex: hex, tier: "sovereign" });

describe("GET /api/me/curator — session status + vouch-eligibility", () => {
  it("a weighty viewer is a curator and can vouch", async () => {
    const res = await request(makeApp({ user: user(EMERGENT) })).get("/api/me/curator");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ isCurator: true, canVouch: true });
  });

  it("a no-weight viewer is neither a curator nor able to vouch", async () => {
    const res = await request(makeApp({ user: user(LOWUSER) })).get("/api/me/curator");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ isCurator: false, canVouch: false });
  });

  it("signed out → 401", async () => {
    const res = await request(makeApp({ user: null })).get("/api/me/curator");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/profile/:id/curator — gains vouchCount", () => {
  it("reports the trusted-vouch count for the subject", async () => {
    const res = await request(makeApp({ vouches: [vouch(A1, SUBJECT), vouch(A2, SUBJECT)] })).get(
      `/api/profile/${SUBJECT}/curator`,
    );
    expect(res.status).toBe(200);
    expect(res.body.vouchCount).toBe(2);
  });
});

describe("GET /api/profile/:id/vouch-status — the session user's own vouch", () => {
  it("reports vouched:true when the session user currently vouches the subject", async () => {
    const res = await request(makeApp({ user: user(A1), vouches: [vouch(A1, SUBJECT)] })).get(
      `/api/profile/${SUBJECT}/vouch-status`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ vouched: true });
  });

  it("reports vouched:false when the session user has not vouched", async () => {
    const res = await request(makeApp({ user: user(A1), vouches: [] })).get(
      `/api/profile/${SUBJECT}/vouch-status`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ vouched: false });
  });
});
