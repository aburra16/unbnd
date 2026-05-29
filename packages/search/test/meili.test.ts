import { describe, expect, it, vi } from "vitest";
import { MeiliProvider } from "../src/meili";

const opts = { url: "http://localhost:7700", apiKey: "test-key" };

function mockFetch(response: {
  ok: boolean;
  status?: number;
  body?: unknown;
  shouldThrow?: Error;
}): typeof fetch {
  return vi.fn(async () => {
    if (response.shouldThrow) throw response.shouldThrow;
    return new Response(JSON.stringify(response.body ?? {}), {
      status: response.status ?? (response.ok ? 200 : 500),
    });
  }) as unknown as typeof fetch;
}

/** Capture every request; return an ok Response with the given body. */
function captureFetch(body: unknown = {}) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fn = vi.fn(async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const doc = {
  id: "ol-a",
  title: "Alpha",
  authorName: "Ada",
  subjects: ["fiction"],
  tags: ["Literary fiction"],
  genreSlugs: ["literary-fiction"],
  format: "reference",
} as const;

describe("MeiliProvider.health", () => {
  it("identifies itself as 'meili'", () => {
    expect(new MeiliProvider(opts, mockFetch({ ok: true })).name).toBe("meili");
  });

  it("calls /health with the master key and reports ok", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ status: "available" }), { status: 200 }),
    ) as unknown as typeof fetch;
    const h = await new MeiliProvider(opts, fetchSpy).health();
    expect(h.ok).toBe(true);
    const [url, init] = (fetchSpy as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(url)).toBe("http://localhost:7700/health");
    expect(new Headers((init?.headers ?? {}) as Record<string, string>).get("Authorization")).toBe(
      "Bearer test-key",
    );
  });

  it("reports ok=false on non-2xx and on fetch throw", async () => {
    expect((await new MeiliProvider(opts, mockFetch({ ok: false, status: 503 })).health()).ok).toBe(false);
    const thrown = await new MeiliProvider(opts, mockFetch({ ok: false, shouldThrow: new Error("ECONNREFUSED") })).health();
    expect(thrown.ok).toBe(false);
    expect(thrown.error).toMatch(/ECONNREFUSED/);
  });
});

describe("MeiliProvider.configureIndex", () => {
  it("creates the index and PATCHes searchable + filterable settings", async () => {
    const { fn, calls } = captureFetch();
    await new MeiliProvider(opts, fn).configureIndex();
    expect(calls.find((c) => c.url.endsWith("/indexes"))?.init?.method).toBe("POST");
    const settings = calls.find((c) => c.url.endsWith("/indexes/books/settings"));
    expect(settings?.init?.method).toBe("PATCH");
    const sent = JSON.parse(String(settings?.init?.body));
    expect(sent.searchableAttributes[0]).toBe("title");
    expect(sent.filterableAttributes).toContain("genreSlugs");
  });
});

describe("MeiliProvider.index", () => {
  it("POSTs documents to the books index", async () => {
    const { fn, calls } = captureFetch();
    await new MeiliProvider(opts, fn).index([doc]);
    const post = calls.find((c) => c.url.endsWith("/indexes/books/documents"));
    expect(post?.init?.method).toBe("POST");
    expect(JSON.parse(String(post?.init?.body))[0].id).toBe("ol-a");
  });

  it("is a no-op for an empty batch", async () => {
    const { fn, calls } = captureFetch();
    await new MeiliProvider(opts, fn).index([]);
    expect(calls).toHaveLength(0);
  });
});

describe("MeiliProvider.search", () => {
  it("maps Meili hits to neutral, PublicBook-shaped results", async () => {
    const { fn } = captureFetch({
      hits: [
        {
          id: "ol-a", title: "Alpha", authorName: "Ada", blurb: "x",
          coverUrl: "https://c/a.jpg", publishYear: 2001, format: "reference", _rankingScore: 0.9,
        },
      ],
      estimatedTotalHits: 1, limit: 6, offset: 0,
    });
    const r = await new MeiliProvider(opts, fn).search({ q: "alpha", limit: 6, offset: 0 });
    expect(r.total).toBe(1);
    expect(r.hits[0]).toMatchObject({ slug: "ol-a", title: "Alpha", authorName: "Ada", score: 0.9 });
    expect((r.hits[0] as Record<string, unknown>).id).toBeUndefined();
  });

  it("builds an AND filter from genre/format", async () => {
    const { fn, calls } = captureFetch({ hits: [], estimatedTotalHits: 0 });
    await new MeiliProvider(opts, fn).search({
      q: "x", limit: 6, offset: 0, filters: { genre: "mystery", format: "reference" },
    });
    const sent = JSON.parse(String(calls[0]?.init?.body));
    expect(sent.filter).toContain('genreSlugs = "mystery"');
    expect(sent.filter).toContain('format = "reference"');
  });
});
