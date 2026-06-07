// Failing tests (red) for Story 67 / ADR 0066 — the curator-roles routes.
// GET /api/profile/:id/curator → { isCurator } = seed allowlist OR vouched
// count-gate OR emergent house-weight. POST /api/curator-roles/template gates the
// vouch (self-vouch rejected). DI harness mirrors the author-verified route tests.
// The routes return 501 (stub) → these fail red.
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
const SEED = "5".repeat(64); // on the operator allowlist
const EMERGENT = "e".repeat(64); // own house-weight ≥ threshold
const VOUCHED = "7".repeat(64); // cleared by ≥ N trusted vouches
const NOBODY = "0".repeat(64); // not seed, not vouched, not weighty
const A1 = "c".repeat(64);
const A2 = "d".repeat(64);

const HEADER: DListAddress<39998> = { kind: 39998, pubkey: asHexPubkey(LIB), dTag: "curator-roles" };

function trust() {
  return new FixtureTrustProvider({
    weights: { [HOUSE]: { [EMERGENT]: 0.9, [A1]: 0.9, [A2]: 0.8 } },
  });
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
  const tags = [
    ...unsigned.tags.map((t: readonly string[]) => [...t]),
    ["json", JSON.stringify(unsigned.payload)],
  ];
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
    curatorSeedPubkeys: [SEED],
    ...over,
  } as unknown as Config;
}

function makeApp(opts: {
  user?: CuratorRolesSessionUser | null;
  vouches?: SignedNostrEvent[];
  config?: Record<string, unknown>;
}) {
  const deps: CuratorRolesDeps = {
    config: baseConfig(opts.config),
    sessionUser: vi.fn(async () => opts.user ?? null),
    // The #p-scoped read of a subject's vouches.
    query: vi.fn(async (_filter: NostrFilter) => opts.vouches ?? []),
    trust: trust(),
  };
  const app = express();
  app.use("/", buildCuratorRolesRouter(deps));
  return app;
}

const isCurator = async (app: express.Express, hex: string) =>
  (await request(app).get(`/api/profile/${hex}/curator`)).body.isCurator;

describe("GET /api/profile/:id/curator — status = seed OR vouched OR emergent", () => {
  it("a seed-allowlist pubkey is a curator", async () => {
    const app = makeApp({});
    const res = await request(app).get(`/api/profile/${SEED}/curator`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ isCurator: true });
  });

  it("a pubkey vouched by ≥ N trusted asserters is a curator", async () => {
    const app = makeApp({ vouches: [vouch(A1, VOUCHED), vouch(A2, VOUCHED)] });
    expect(await isCurator(app, VOUCHED)).toBe(true);
  });

  it("a pubkey whose own house-weight clears the threshold is a curator (emergent fallback)", async () => {
    const app = makeApp({});
    expect(await isCurator(app, EMERGENT)).toBe(true);
  });

  it("a pubkey that is none of seed / vouched / weighty is not a curator", async () => {
    const app = makeApp({});
    const res = await request(app).get(`/api/profile/${NOBODY}/curator`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ isCurator: false });
  });

  it("a single trusted vouch (below N=2) is not enough", async () => {
    const app = makeApp({ vouches: [vouch(A1, VOUCHED)] });
    expect(await isCurator(app, VOUCHED)).toBe(false);
  });
});

describe("POST /api/curator-roles/template — vouch gate", () => {
  it("rejects a self-vouch (you cannot vouch for yourself)", async () => {
    const app = makeApp({ user: { id: "u1", pubkeyHex: A1, tier: "sovereign" } });
    const res = await request(app)
      .post("/api/curator-roles/template")
      .send({ subject: A1 });
    expect(res.status).toBe(400);
  });
});
