// Failing test (red) for Story 64 — the `api.ol.lookup(isbn)` web client method,
// per ADR 0063 §2 ("Web wiring"). The method must exist on the real `api`, issue
// `GET /api/ol/lookup?isbn=<encoded>`, and return the parsed `{ found, … }` body.
//
// `api.ol` does not exist yet. A static `api.ol.lookup(...)` reference would be a
// TS error (TS2339) and break `pnpm -r typecheck`. We read the method through an
// opaque cast so tsc stays clean and the red is the assertion: the `ol.lookup`
// method is missing on today's client.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../src/lib/api";

type OlLookupFn = (isbn: string) => Promise<{ found: boolean; coverUrl?: string }>;

function olLookup(): OlLookupFn | undefined {
  const a = api as unknown as { ol?: { lookup?: OlLookupFn } };
  return a.ol?.lookup;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ found: true, coverUrl: "https://covers.openlibrary.org/b/isbn/9780140328721-L.jpg" }),
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("api.ol.lookup", () => {
  it("exists as a callable method on the client", () => {
    expect(typeof olLookup()).toBe("function");
  });

  it("issues GET /api/ol/lookup with the URL-encoded isbn and returns the parsed body", async () => {
    const lookup = olLookup();
    expect(lookup).toBeTypeOf("function");
    const out = await lookup!("9780140328721");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledPath = fetchMock.mock.calls[0][0] as string;
    expect(calledPath).toContain("/api/ol/lookup?isbn=9780140328721");
    expect(out.found).toBe(true);
    expect(out.coverUrl).toContain("/b/isbn/9780140328721-L.jpg");
  });
});
