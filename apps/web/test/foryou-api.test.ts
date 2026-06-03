// Story 36 / ADR 0037 §5 (web seam) — `api.foryou()` + the `ForYou` type, typed
// to the REAL api contract: `{ state: "personalized" | "not_personalized" |
// "anonymous"; books: PublicBook[] }`. Reuses the existing `PublicBook` type; no
// trust number/tier on the wire. The Home component test fixtures MUST be typed
// to this real shape (no fabricated divorced mock) — this test pins that the type
// and the client method exist and match.
//
// FAILING until `api.foryou()` + the `ForYou` type are added to
// apps/web/src/lib/api.ts (intentionally red — module member does not exist).
import { describe, expect, it, vi, afterEach } from "vitest";
import { api, type ForYou, type PublicBook } from "../src/lib/api";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function book(slug: string, title: string): PublicBook {
  return { slug, title, authorName: `Author of ${title}`, format: "reference" };
}

describe("api.foryou — typed to the real ForYou contract", () => {
  it("exposes api.foryou() returning the { state, books } shape", async () => {
    // A ForYou value built to the real exported type — if the type drifts from
    // the api return shape, this stops compiling (the masked-mock guard).
    const personalized: ForYou = {
      state: "personalized",
      books: [book("orbital", "Orbital")],
    };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => personalized,
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    expect(typeof api.foryou).toBe("function");
    const res: ForYou = await api.foryou();
    expect(res.state).toBe("personalized");
    expect(res.books.map((b: PublicBook) => b.slug)).toEqual(["orbital"]);
  });

  it("sends the session cookie (credentialed fetch) so the vantage is the signed-in user", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ state: "anonymous", books: [] } satisfies ForYou),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    await api.foryou();
    const init = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit;
    expect(init.credentials).toBe("include");
  });

  it("the three states are assignable; non-personalized/anonymous carry empty books", () => {
    const notPersonalized: ForYou = { state: "not_personalized", books: [] };
    const anonymous: ForYou = { state: "anonymous", books: [] };
    expect(notPersonalized.books).toEqual([]);
    expect(anonymous.books).toEqual([]);
  });
});
