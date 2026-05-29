import { describe, expect, it, vi } from "vitest";
import { MeiliProvider } from "../../src/search/meili";
import type { Config } from "../../src/config";

const baseConfig: Config = {
  port: 8787,
  strfryUrl: "ws://localhost:7777",
  neo4jBoltUrl: "bolt://localhost:7687",
  neo4jUser: "neo4j",
  neo4jPassword: "test",
  tapestryApiUrl: "http://localhost:8080",
  searchUrl: "http://localhost:7700",
  searchApiKey: "test-key",
  searchProvider: "meili",
  databaseUrl: "postgres://x:x@localhost:5432/x",
  backupEncryptionKey: "a".repeat(64),
  publicOrigin: "http://localhost:5181",
};

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

describe("MeiliProvider", () => {
  it("identifies itself as the 'meili' provider", () => {
    const p = new MeiliProvider(baseConfig, mockFetch({ ok: true }));
    expect(p.name).toBe("meili");
  });

  it("calls the Meili /health endpoint with the master key", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ status: "available" }), { status: 200 }),
    ) as unknown as typeof fetch;
    const p = new MeiliProvider(baseConfig, fetchSpy);
    await p.health();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchSpy as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(url)).toBe("http://localhost:7700/health");
    const headers = new Headers((init?.headers ?? {}) as Record<string, string>);
    expect(headers.get("Authorization")).toBe("Bearer test-key");
  });

  it("returns ok=true when Meili reports status=available", async () => {
    const p = new MeiliProvider(
      baseConfig,
      mockFetch({ ok: true, body: { status: "available" } }),
    );
    const h = await p.health();
    expect(h.ok).toBe(true);
    expect(h.provider).toBe("meili");
  });

  it("returns ok=false when Meili returns a non-2xx response", async () => {
    const p = new MeiliProvider(
      baseConfig,
      mockFetch({ ok: false, status: 503 }),
    );
    const h = await p.health();
    expect(h.ok).toBe(false);
    expect(h.error).toMatch(/503|unavailable|status/i);
  });

  it("returns ok=false when fetch itself throws", async () => {
    const p = new MeiliProvider(
      baseConfig,
      mockFetch({
        ok: false,
        shouldThrow: new Error("ECONNREFUSED"),
      }),
    );
    const h = await p.health();
    expect(h.ok).toBe(false);
    expect(h.error).toMatch(/ECONNREFUSED/);
  });

  it("populates latencyMs on every result", async () => {
    const p = new MeiliProvider(
      baseConfig,
      mockFetch({ ok: true, body: { status: "available" } }),
    );
    const h = await p.health();
    expect(h.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

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

describe("MeiliProvider.configureIndex", () => {
  it("creates the index and PATCHes searchable + filterable settings", async () => {
    const { fn, calls } = captureFetch();
    await new MeiliProvider(baseConfig, fn).configureIndex();
    const create = calls.find((c) => c.url.endsWith("/indexes"));
    expect(create?.init?.method).toBe("POST");
    const settings = calls.find((c) => c.url.endsWith("/indexes/books/settings"));
    expect(settings?.init?.method).toBe("PATCH");
    const sentBody = JSON.parse(String(settings?.init?.body));
    expect(sentBody.searchableAttributes[0]).toBe("title");
    expect(sentBody.filterableAttributes).toContain("genreSlugs");
  });
});

describe("MeiliProvider.index", () => {
  it("POSTs documents to the books index", async () => {
    const { fn, calls } = captureFetch();
    await new MeiliProvider(baseConfig, fn).index([doc]);
    const post = calls.find((c) => c.url.endsWith("/indexes/books/documents"));
    expect(post?.init?.method).toBe("POST");
    expect(JSON.parse(String(post?.init?.body))[0].id).toBe("ol-a");
  });

  it("is a no-op for an empty batch", async () => {
    const { fn, calls } = captureFetch();
    await new MeiliProvider(baseConfig, fn).index([]);
    expect(calls).toHaveLength(0);
  });
});

describe("MeiliProvider.search", () => {
  it("maps Meili hits to neutral, PublicBook-shaped results", async () => {
    const { fn } = captureFetch({
      hits: [
        {
          id: "ol-a",
          title: "Alpha",
          authorName: "Ada",
          blurb: "x",
          coverUrl: "https://c/a.jpg",
          publishYear: 2001,
          format: "reference",
          _rankingScore: 0.9,
        },
      ],
      estimatedTotalHits: 1,
      limit: 6,
      offset: 0,
    });
    const r = await new MeiliProvider(baseConfig, fn).search({ q: "alpha", limit: 6, offset: 0 });
    expect(r.total).toBe(1);
    expect(r.hits[0]).toMatchObject({ slug: "ol-a", title: "Alpha", authorName: "Ada", score: 0.9 });
    // neutral hit carries no provider-only fields
    expect((r.hits[0] as Record<string, unknown>).id).toBeUndefined();
  });

  it("builds an AND filter from genre/format/language", async () => {
    const { fn, calls } = captureFetch({ hits: [], estimatedTotalHits: 0 });
    await new MeiliProvider(baseConfig, fn).search({
      q: "x",
      limit: 6,
      offset: 0,
      filters: { genre: "mystery", format: "reference" },
    });
    const sent = JSON.parse(String(calls[0]?.init?.body));
    expect(sent.filter).toContain('genreSlugs = "mystery"');
    expect(sent.filter).toContain('format = "reference"');
  });
});
