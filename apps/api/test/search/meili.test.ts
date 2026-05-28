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
