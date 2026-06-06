// Failing tests (red) for Story 65 / ADR 0064 — GET /api/profile/:id/taste-match.
// Observer-relative, read-time: the viewer (session) vs the target (path param),
// raw rating agreement over their co-rated books, honest below the overlap min,
// hidden when signed out, self when viewing your own profile, best-effort (never
// 500). DI harness mirrors foryou.test.ts: express + supertest + injected
// sessionUser/queryPaged + the signed kind-39999 rating fixtures.
// The route currently returns 501 (stub) → these fail red.
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { getPublicKey } from "nostr-tools/pure";
import { asHexPubkey, type SignedNostrEvent } from "@unbnd/schemas";
import type { Config } from "../../src/config";
import type { NostrFilter, PagedResult } from "../../src/nostr/query";
import { LIBRARIAN, signedRating } from "../ratings/_fixtures";
import {
  buildTasteMatchRouter,
  type TasteMatchDeps,
  type TasteMatchSessionUser,
} from "../../src/routes/profile-taste-match";

const VIEWER_SK = new Uint8Array(32).fill(9);
const TARGET_SK = new Uint8Array(32).fill(7);
const VIEWER_HEX = asHexPubkey(getPublicKey(VIEWER_SK));
const TARGET_HEX = asHexPubkey(getPublicKey(TARGET_SK));

const viewerRating = (bookSlug: string, score: number): SignedNostrEvent =>
  signedRating({ sk: VIEWER_SK, bookSlug, score }).event;
const targetRating = (bookSlug: string, score: number): SignedNostrEvent =>
  signedRating({ sk: TARGET_SK, bookSlug, score }).event;

// Overrides are loosely typed: `tasteMatchMinOverlap` is a NEW config knob the
// Implementer adds to Config (ADR 0064). The red set must not prejudge the Config
// type, so the literal is cast through `unknown`.
function baseConfig(overrides: Record<string, unknown> = {}): Config {
  return {
    librarianPubkey: LIBRARIAN,
    tasteMatchMinOverlap: 5,
    ...overrides,
  } as unknown as Config;
}

const session = (hex = VIEWER_HEX): TasteMatchSessionUser => ({
  id: "u1",
  pubkeyHex: hex,
  tier: "sovereign",
});

/** Branches on `authors` so each user's author-scoped read returns their ratings. */
function makeQueryPaged(viewer: SignedNostrEvent[], target: SignedNostrEvent[]) {
  return vi.fn(async (filter: NostrFilter): Promise<PagedResult> => {
    const authors = (filter.authors as string[] | undefined) ?? [];
    if (authors.includes(VIEWER_HEX)) return { events: viewer, capped: false };
    if (authors.includes(TARGET_HEX)) return { events: target, capped: false };
    return { events: [], capped: false };
  });
}

function makeApp(opts: {
  viewer?: SignedNostrEvent[];
  target?: SignedNostrEvent[];
  user?: TasteMatchSessionUser | null;
  config?: Record<string, unknown>;
  queryPaged?: TasteMatchDeps["queryPaged"];
}) {
  const queryPaged =
    opts.queryPaged ?? makeQueryPaged(opts.viewer ?? [], opts.target ?? []);
  const deps: TasteMatchDeps = {
    config: baseConfig(opts.config),
    sessionUser: vi.fn(async () =>
      opts.user === undefined ? session() : opts.user,
    ),
    queryPaged,
  };
  const app = express();
  app.use("/", buildTasteMatchRouter(deps));
  return { app, deps, queryPaged };
}

const url = (hex: string) => `/api/profile/${hex}/taste-match`;

describe("GET /api/profile/:id/taste-match — AC-1: match when overlap clears the bar", () => {
  it("returns the percentage and the count of books in common for a signed-in viewer", async () => {
    const books = ["a", "b", "c", "d", "e"];
    const { app } = makeApp({
      viewer: books.map((s) => viewerRating(s, 5)),
      target: books.map((s) => targetRating(s, 5)), // identical → 100%
    });
    const res = await request(app).get(url(TARGET_HEX));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      signedIn: true,
      self: false,
      commonBooks: 5,
      thresholdMet: true,
      percentage: 100,
    });
  });

  it("reads BOTH the viewer's and the target's ratings, author-scoped (observer = the session user)", async () => {
    const books = ["a", "b", "c", "d", "e"];
    const queryPaged = makeQueryPaged(
      books.map((s) => viewerRating(s, 5)),
      books.map((s) => targetRating(s, 5)),
    );
    const { app } = makeApp({ queryPaged });
    await request(app).get(url(TARGET_HEX));
    const authorsPerCall = queryPaged.mock.calls.map(
      (c) => (c[0].authors as string[] | undefined) ?? [],
    );
    expect(authorsPerCall.some((a) => a.includes(VIEWER_HEX))).toBe(true);
    expect(authorsPerCall.some((a) => a.includes(TARGET_HEX))).toBe(true);
  });
});

describe("GET /api/profile/:id/taste-match — AC-3: honest below the threshold", () => {
  it("fewer than the minimum co-rated books → thresholdMet false, no percentage", async () => {
    const books = ["a", "b", "c"]; // 3 < min 5
    const { app } = makeApp({
      viewer: books.map((s) => viewerRating(s, 5)),
      target: books.map((s) => targetRating(s, 5)),
    });
    const res = await request(app).get(url(TARGET_HEX));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      signedIn: true,
      self: false,
      commonBooks: 3,
      thresholdMet: false,
    });
    expect((res.body as { percentage?: number }).percentage).toBeUndefined();
  });

  it("honors a configurable TASTE_MATCH_MIN_OVERLAP (5 co-rated, min 10 → not met)", async () => {
    const books = ["a", "b", "c", "d", "e"];
    const { app } = makeApp({
      viewer: books.map((s) => viewerRating(s, 5)),
      target: books.map((s) => targetRating(s, 5)),
      config: { tasteMatchMinOverlap: 10 },
    });
    const res = await request(app).get(url(TARGET_HEX));
    expect(res.body).toMatchObject({ thresholdMet: false, commonBooks: 5 });
  });
});

describe("GET /api/profile/:id/taste-match — AC-5: reflects the overlap as it grows", () => {
  it("4 co-rated is below the bar; a 5th co-rated book crosses it", async () => {
    const four = ["a", "b", "c", "d"];
    const five = ["a", "b", "c", "d", "e"];
    const below = makeApp({
      viewer: four.map((s) => viewerRating(s, 5)),
      target: four.map((s) => targetRating(s, 5)),
    });
    const met = makeApp({
      viewer: five.map((s) => viewerRating(s, 5)),
      target: five.map((s) => targetRating(s, 5)),
    });
    const belowRes = await request(below.app).get(url(TARGET_HEX));
    const metRes = await request(met.app).get(url(TARGET_HEX));
    expect(belowRes.body).toMatchObject({ thresholdMet: false, commonBooks: 4 });
    expect(metRes.body).toMatchObject({ thresholdMet: true, commonBooks: 5 });
  });
});

describe("GET /api/profile/:id/taste-match — AC-4: hidden when signed out; self when own profile", () => {
  it("signed out → { signedIn: false } and no rating reads", async () => {
    const queryPaged = makeQueryPaged([], []);
    const { app } = makeApp({ user: null, queryPaged });
    const res = await request(app).get(url(TARGET_HEX));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ signedIn: false });
    expect(queryPaged).not.toHaveBeenCalled();
  });

  it("viewing your own profile → { signedIn: true, self: true }", async () => {
    const { app } = makeApp({ user: session(VIEWER_HEX) });
    const res = await request(app).get(url(VIEWER_HEX));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ signedIn: true, self: true });
  });
});

describe("GET /api/profile/:id/taste-match — best-effort: degrade, never 500", () => {
  it("a rating-read failure degrades to an honest empty match (200), not a 500", async () => {
    const queryPaged = vi.fn(async (): Promise<PagedResult> => {
      throw new Error("relay down");
    });
    const { app } = makeApp({ user: session(), queryPaged });
    const res = await request(app).get(url(TARGET_HEX));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      signedIn: true,
      self: false,
      commonBooks: 0,
      thresholdMet: false,
    });
  });
});
