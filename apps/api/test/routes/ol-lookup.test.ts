// Failing tests (red) for Story 64 — the public, best-effort, always-200
// `GET /api/ol/lookup?isbn=` endpoint, per ADR 0063 §1–§2.
//
// The endpoint fetches Open Library `search.json?q=isbn:<isbn>&fields=…`
// server-side with an injected `fetchImpl`, normalizes the first doc to
// `{ found, title?, authorName?, coverUrl?, pageCount?, publishYear? }`
// (cover synthesized BY ISBN), is bounded by a 5s AbortController timeout, and
// resolves EVERY failure (OL down / non-2xx / parse-fail / timeout / no match /
// bad isbn) to `200 { found: false }` — never a 5xx that could break the form.
//
// The handler module does not exist yet. A static `import` would break `tsc`
// (TS2307) and the CI build gate. Routing the import through a runtime-computed
// specifier hides it from the resolver, so `pnpm -r typecheck` stays clean and
// the red is a clean assertion-level "Cannot find module" / "buildOlLookupRouter
// is not a function", not a compile wall (mirrors apps/seeder/test/_load.ts).
import express, { type Router } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Opaque loader for the not-yet-existing route module.
// ---------------------------------------------------------------------------
type FetchImpl = typeof fetch;

type OlLookupResult = {
  found: boolean;
  title?: string;
  authorName?: string;
  coverUrl?: string;
  pageCount?: number;
  publishYear?: number;
};

type OlLookupModule = {
  buildOlLookupRouter: (deps?: { fetchImpl?: FetchImpl }) => Router;
  UNBND_API_USER_AGENT: string;
  normalizeDoc: (doc: unknown, isbn: string) => OlLookupResult;
  normalizeIsbnParam: (raw: unknown) => string | null;
};

async function loadOlLookup(): Promise<OlLookupModule> {
  const spec = "../../src/routes/ol-lookup";
  return (await import(/* @vite-ignore */ spec)) as OlLookupModule;
}

// ---------------------------------------------------------------------------
// A fake `fetch` returning a canned OL `search.json` body, and helpers to drive
// the not-found / non-2xx / throw / parse-fail / hang paths.
// ---------------------------------------------------------------------------
type OlSearchDoc = {
  title?: string;
  author_name?: string[];
  cover_i?: number;
  number_of_pages_median?: number;
  first_publish_year?: number;
};

function okFetch(body: unknown): FetchImpl {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => body,
  })) as unknown as FetchImpl;
}

function statusFetch(status: number): FetchImpl {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({}),
  })) as unknown as FetchImpl;
}

function throwingFetch(): FetchImpl {
  return vi.fn(async () => {
    throw new Error("ECONNREFUSED openlibrary.org");
  }) as unknown as FetchImpl;
}

function parseFailFetch(): FetchImpl {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError("Unexpected token < in JSON");
    },
  })) as unknown as FetchImpl;
}

/** A fetch that honors the AbortSignal: rejects with an AbortError when aborted
 *  (the shape native fetch produces on `controller.abort()`), and otherwise
 *  never resolves — so the route must rely on its own timeout. */
function hangingFetch(): FetchImpl {
  return vi.fn((_url: string, init?: { signal?: AbortSignal }) => {
    return new Promise((_resolve, reject) => {
      const signal = init?.signal;
      if (signal) {
        signal.addEventListener("abort", () => {
          const err = new Error("The operation was aborted");
          (err as { name: string }).name = "AbortError";
          reject(err);
        });
      }
    });
  }) as unknown as FetchImpl;
}

const FOUND_DOC: OlSearchDoc = {
  title: "Fantastic Mr Fox",
  author_name: ["Roald Dahl"],
  cover_i: 6498519,
  number_of_pages_median: 96,
  first_publish_year: 1970,
};
const ISBN = "9780140328721";
const COVER_BY_ISBN = `https://covers.openlibrary.org/b/isbn/${ISBN}-L.jpg`;

async function makeApp(fetchImpl: FetchImpl, opts?: { timeoutMs?: number }) {
  const { buildOlLookupRouter } = await loadOlLookup();
  const app = express();
  app.use("/", buildOlLookupRouter({ fetchImpl, ...opts }));
  return app;
}

describe("GET /api/ol/lookup — found ISBN (ADR 0063 §1)", () => {
  it("returns 200 with the normalized metadata for a matching ISBN", async () => {
    const app = await makeApp(okFetch({ numFound: 1, docs: [FOUND_DOC] }));
    const res = await request(app).get(`/api/ol/lookup?isbn=${ISBN}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      found: true,
      title: "Fantastic Mr Fox",
      authorName: "Roald Dahl",
      coverUrl: COVER_BY_ISBN,
      pageCount: 96,
      publishYear: 1970,
    });
  });

  it("synthesizes the cover URL by ISBN, not by cover_i", async () => {
    const app = await makeApp(okFetch({ docs: [FOUND_DOC] }));
    const res = await request(app).get(`/api/ol/lookup?isbn=${ISBN}`);
    expect(res.body.coverUrl).toBe(COVER_BY_ISBN);
    expect(res.body.coverUrl).not.toContain("/b/id/");
  });

  it("omits absent fields but still reports found:true with the cover", async () => {
    // A doc with only a title — author/pages/year missing.
    const app = await makeApp(okFetch({ docs: [{ title: "Bare Title" }] }));
    const res = await request(app).get(`/api/ol/lookup?isbn=${ISBN}`);
    expect(res.status).toBe(200);
    expect(res.body.found).toBe(true);
    expect(res.body.title).toBe("Bare Title");
    expect(res.body.coverUrl).toBe(COVER_BY_ISBN);
    expect(res.body).not.toHaveProperty("authorName");
    expect(res.body).not.toHaveProperty("pageCount");
    expect(res.body).not.toHaveProperty("publishYear");
  });
});

describe("GET /api/ol/lookup — the OL request shape (ADR 0063 §1–§2)", () => {
  it("calls OL search.json with q=isbn:<isbn>, the five fields, and the polite UA", async () => {
    const fetchImpl = okFetch({ docs: [FOUND_DOC] });
    const { UNBND_API_USER_AGENT } = await loadOlLookup();
    const app = express();
    const { buildOlLookupRouter } = await loadOlLookup();
    app.use("/", buildOlLookupRouter({ fetchImpl }));

    await request(app).get(`/api/ol/lookup?isbn=${ISBN}`);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = (fetchImpl as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0] as [string, { headers?: Record<string, string> }];
    expect(calledUrl).toContain("https://openlibrary.org/search.json");
    expect(calledUrl).toContain(`q=isbn%3A${ISBN}`);
    // The five present fields the ADR pins.
    expect(calledUrl).toContain("fields=");
    expect(decodeURIComponent(calledUrl)).toContain("title");
    expect(decodeURIComponent(calledUrl)).toContain("author_name");
    expect(decodeURIComponent(calledUrl)).toContain("cover_i");
    expect(decodeURIComponent(calledUrl)).toContain("number_of_pages_median");
    expect(decodeURIComponent(calledUrl)).toContain("first_publish_year");
    // A distinct, polite User-Agent (not the seeder's).
    const ua = init.headers?.["User-Agent"];
    expect(ua).toBe(UNBND_API_USER_AGENT);
    expect(ua).toContain("unbnd-api");
  });
});

describe("GET /api/ol/lookup — best-effort, always 200, never a 5xx (ADR 0063 §2)", () => {
  it("returns 200 { found:false } when OL has no match (numFound:0, docs:[])", async () => {
    const app = await makeApp(okFetch({ numFound: 0, docs: [] }));
    const res = await request(app).get(`/api/ol/lookup?isbn=${ISBN}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ found: false });
  });

  it("returns 200 { found:false } when OL responds non-2xx", async () => {
    const app = await makeApp(statusFetch(503));
    const res = await request(app).get(`/api/ol/lookup?isbn=${ISBN}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ found: false });
  });

  it("returns 200 { found:false } when the OL fetch throws (network down)", async () => {
    const app = await makeApp(throwingFetch());
    const res = await request(app).get(`/api/ol/lookup?isbn=${ISBN}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ found: false });
  });

  it("returns 200 { found:false } when the OL body fails to parse", async () => {
    const app = await makeApp(parseFailFetch());
    const res = await request(app).get(`/api/ol/lookup?isbn=${ISBN}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ found: false });
  });
});

describe("GET /api/ol/lookup — bounded by a timeout (ADR 0063 §2)", () => {
  it("aborts a hung OL and resolves 200 { found:false } (does not hang the request)", async () => {
    // A short REAL timeout (injected) drives the route's AbortController against
    // a fetch that hangs until aborted, so the catch resolves to { found:false }.
    // (Fake timers do not compose with supertest's socket I/O, so the abort
    // budget is shrunk via the injectable timeoutMs instead.)
    const app = await makeApp(hangingFetch(), { timeoutMs: 20 });
    const res = await request(app).get(`/api/ol/lookup?isbn=${ISBN}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ found: false });
  });

  it("passes an AbortSignal to the OL fetch", async () => {
    const fetchImpl = okFetch({ docs: [FOUND_DOC] });
    const app = await makeApp(fetchImpl);
    await request(app).get(`/api/ol/lookup?isbn=${ISBN}`);
    const init = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0][1] as { signal?: AbortSignal };
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("GET /api/ol/lookup — isbn validation (ADR 0063 §2: malformed → 200 {found:false}, no fetch)", () => {
  it("returns 200 { found:false } for a missing isbn and never calls OL", async () => {
    const fetchImpl = okFetch({ docs: [FOUND_DOC] });
    const app = await makeApp(fetchImpl);
    const res = await request(app).get(`/api/ol/lookup`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ found: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns 200 { found:false } for a junk isbn (wrong length) and never calls OL", async () => {
    const fetchImpl = okFetch({ docs: [FOUND_DOC] });
    const app = await makeApp(fetchImpl);
    const res = await request(app).get(`/api/ol/lookup?isbn=12345`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ found: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("normalizes a hyphenated ISBN-13 before querying OL", async () => {
    const fetchImpl = okFetch({ docs: [FOUND_DOC] });
    const app = await makeApp(fetchImpl);
    await request(app).get(`/api/ol/lookup?isbn=978-0-14-032872-1`);
    const calledUrl = (fetchImpl as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0][0] as string;
    expect(calledUrl).toContain(`q=isbn%3A${ISBN}`);
  });
});

// ---------------------------------------------------------------------------
// Pure helpers (ADR 0063 Implementation notes): normalizeDoc + normalizeIsbnParam.
// ---------------------------------------------------------------------------
describe("normalizeDoc (pure, ADR 0063 §1)", () => {
  it("maps a full doc to the four-field result + the by-ISBN cover", async () => {
    const { normalizeDoc } = await loadOlLookup();
    expect(normalizeDoc(FOUND_DOC, ISBN)).toEqual({
      found: true,
      title: "Fantastic Mr Fox",
      authorName: "Roald Dahl",
      coverUrl: COVER_BY_ISBN,
      pageCount: 96,
      publishYear: 1970,
    });
  });

  it("returns { found:false } for an absent doc", async () => {
    const { normalizeDoc } = await loadOlLookup();
    expect(normalizeDoc(undefined, ISBN)).toEqual({ found: false });
  });

  it("trims title/author and drops empty strings, keeping the cover", async () => {
    const { normalizeDoc } = await loadOlLookup();
    const out = normalizeDoc(
      { title: "  Spaced  ", author_name: ["   "] },
      ISBN,
    );
    expect(out.found).toBe(true);
    expect(out.title).toBe("Spaced");
    expect(out).not.toHaveProperty("authorName");
    expect(out.coverUrl).toBe(COVER_BY_ISBN);
  });
});

describe("normalizeIsbnParam (pure, ADR 0063 §2 — same rule as DuplicateCheck)", () => {
  it("accepts a clean 13-digit ISBN", async () => {
    const { normalizeIsbnParam } = await loadOlLookup();
    expect(normalizeIsbnParam("9780140328721")).toBe("9780140328721");
  });

  it("strips hyphens/spaces from an ISBN-13", async () => {
    const { normalizeIsbnParam } = await loadOlLookup();
    expect(normalizeIsbnParam("978-0-14-032872-1")).toBe("9780140328721");
  });

  it("accepts a 10-char ISBN with a trailing X (uppercased)", async () => {
    const { normalizeIsbnParam } = await loadOlLookup();
    expect(normalizeIsbnParam("080214415x")).toBe("080214415X");
  });

  it("rejects a wrong-length string", async () => {
    const { normalizeIsbnParam } = await loadOlLookup();
    expect(normalizeIsbnParam("12345")).toBeNull();
  });

  it("rejects an empty/absent value", async () => {
    const { normalizeIsbnParam } = await loadOlLookup();
    expect(normalizeIsbnParam("")).toBeNull();
    expect(normalizeIsbnParam(undefined)).toBeNull();
  });
});
