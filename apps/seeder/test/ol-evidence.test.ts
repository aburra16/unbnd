// Failing tests for Story 104, per ADR 0093 §3: the year evidence comes from
// Open Library search in batches of 100 (works by key, then first authors by
// key). HTTP is mocked; we pin the request shape, the batching, the parsing,
// and that an HTTP error throws (a run never acts on partial evidence).
//
// The module does not exist yet; loaded via the opaque specifier (_load.ts).
import { describe, expect, it, vi } from "vitest";
import { loadSeederModule } from "./_load";

type WorkEvidence = { readonly editionYears: readonly number[]; readonly authorKey?: string };
type AuthorEvidence = { readonly name?: string; readonly birthYear?: number };
type EvidenceOpts = {
  readonly fetchImpl?: typeof fetch;
  readonly userAgent?: string;
  readonly batchSize?: number;
  readonly delayMs?: number;
};
type EvidenceModule = {
  fetchWorkEvidence: (
    workIds: readonly string[],
    opts?: EvidenceOpts,
  ) => Promise<Map<string, WorkEvidence>>;
  fetchAuthors: (
    authorKeys: readonly string[],
    opts?: EvidenceOpts,
  ) => Promise<Map<string, AuthorEvidence>>;
};

const load = () => loadSeederModule<EvidenceModule>("ol-evidence");

const okJson = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

type Call = [string, RequestInit | undefined];
const calls = (f: typeof fetch): Call[] =>
  (f as unknown as ReturnType<typeof vi.fn>).mock.calls as Call[];
const param = (url: string, name: string): string =>
  new URL(url).searchParams.get(name) ?? "";

describe("fetchWorkEvidence — works by key", () => {
  it("asks search.json for the works' edition years and first author", async () => {
    const { fetchWorkEvidence } = await load();
    const fetchImpl = vi.fn(async () =>
      okJson({
        docs: [
          { key: "/works/OL52114W", publish_year: [1906, 0, 1898], author_key: ["OL13066A"] },
        ],
      }),
    ) as unknown as typeof fetch;

    const got = await fetchWorkEvidence(["OL52114W", "OL1W"], { fetchImpl, delayMs: 0 });

    const [url, init] = calls(fetchImpl)[0]!;
    expect(url.startsWith("https://openlibrary.org/search.json?")).toBe(true);
    expect(param(url, "q")).toBe('key:("/works/OL52114W" OR "/works/OL1W")');
    expect(param(url, "fields").split(",").sort()).toEqual(["author_key", "key", "publish_year"]);
    expect(param(url, "limit")).toBe("2");
    expect((init?.headers as Record<string, string>)["User-Agent"]).toMatch(/unbnd/i);

    expect(got.get("OL52114W")).toEqual({ editionYears: [0, 1898, 1906], authorKey: "OL13066A" });
    expect(got.has("OL1W")).toBe(false); // not returned = no evidence
  });

  it("splits the ids into batches of 100", async () => {
    const { fetchWorkEvidence } = await load();
    const fetchImpl = vi.fn(async () => okJson({ docs: [] })) as unknown as typeof fetch;
    const ids = Array.from({ length: 250 }, (_v, i) => `OL${i + 1}W`);

    await fetchWorkEvidence(ids, { fetchImpl, delayMs: 0 });

    const qs = calls(fetchImpl).map(([u]) => param(u, "q"));
    expect(qs).toHaveLength(3);
    expect(qs.map((q) => q.split(" OR ").length)).toEqual([100, 100, 50]);
  });

  it("asks once per distinct id and makes no request for none", async () => {
    const { fetchWorkEvidence } = await load();
    const fetchImpl = vi.fn(async () => okJson({ docs: [] })) as unknown as typeof fetch;

    await fetchWorkEvidence([], { fetchImpl, delayMs: 0 });
    expect(calls(fetchImpl)).toHaveLength(0);

    await fetchWorkEvidence(["OL1W", "OL1W"], { fetchImpl, delayMs: 0 });
    expect(param(calls(fetchImpl)[0]![0], "q")).toBe('key:("/works/OL1W")');
  });

  it("keeps only whole-number edition years, sorted and distinct", async () => {
    const { fetchWorkEvidence } = await load();
    const fetchImpl = vi.fn(async () =>
      okJson({ docs: [{ key: "/works/OL9W", publish_year: [2008, 2007, 2007, 1658.5, "x"] }] }),
    ) as unknown as typeof fetch;

    const got = await fetchWorkEvidence(["OL9W"], { fetchImpl, delayMs: 0 });

    expect(got.get("OL9W")).toEqual({ editionYears: [2007, 2008] });
  });

  it("throws on an HTTP error", async () => {
    const { fetchWorkEvidence } = await load();
    const fetchImpl = vi.fn(
      async () => ({ ok: false, status: 503, json: async () => ({}) }) as unknown as Response,
    ) as unknown as typeof fetch;

    await expect(fetchWorkEvidence(["OL1W"], { fetchImpl, delayMs: 0 })).rejects.toThrow(/503/);
  });
});

describe("fetchAuthors — first authors by key", () => {
  it("asks search/authors.json for the name and birth date, and reads the birth year", async () => {
    const { fetchAuthors } = await load();
    const fetchImpl = vi.fn(async () =>
      okJson({
        docs: [
          { key: "OL13066A", name: "H. G. Wells", birth_date: "21 September 1866" },
          { key: "OL2A", name: "Homer", birth_date: "8th century B.C." },
          { key: "OL3A", name: "Anonymous" },
        ],
      }),
    ) as unknown as typeof fetch;

    const got = await fetchAuthors(["OL13066A", "OL2A", "OL3A"], { fetchImpl, delayMs: 0 });

    const [url] = calls(fetchImpl)[0]!;
    expect(url.startsWith("https://openlibrary.org/search/authors.json?")).toBe(true);
    expect(param(url, "q")).toBe(
      'key:("/authors/OL13066A" OR "/authors/OL2A" OR "/authors/OL3A")',
    );
    expect(param(url, "fields").split(",").sort()).toEqual(["birth_date", "key", "name"]);

    expect(got.get("OL13066A")).toEqual({ name: "H. G. Wells", birthYear: 1866 });
    expect(got.get("OL2A")).toEqual({ name: "Homer" });
    expect(got.get("OL3A")).toEqual({ name: "Anonymous" });
  });

  it("accepts keys returned with the /authors/ prefix", async () => {
    const { fetchAuthors } = await load();
    const fetchImpl = vi.fn(async () =>
      okJson({ docs: [{ key: "/authors/OL5A", name: "Ira Levin", birth_date: "1929" }] }),
    ) as unknown as typeof fetch;

    const got = await fetchAuthors(["OL5A"], { fetchImpl, delayMs: 0 });

    expect(got.get("OL5A")).toEqual({ name: "Ira Levin", birthYear: 1929 });
  });

  it("throws on an HTTP error", async () => {
    const { fetchAuthors } = await load();
    const fetchImpl = vi.fn(
      async () => ({ ok: false, status: 429, json: async () => ({}) }) as unknown as Response,
    ) as unknown as typeof fetch;

    await expect(fetchAuthors(["OL1A"], { fetchImpl, delayMs: 0 })).rejects.toThrow(/429/);
  });
});
