// FAILING TESTS — Story 80 / ADR 0078 (search layer).
//
// (1) buildBookDocument returns null for a DELISTED record — driven by the
// isDelistedRecord predicate, not parse luck: the fixture is a fully parseable
// record WITH the marker, so only the intentional predicate check nulls it.
// (2) The SearchProvider gains delete(ids); meili implements it as the
// documents delete-batch call so the demote cycle removes a doc from the live
// index without waiting for the batch rebuild.
import { describe, expect, it, vi } from "vitest";
import {
  asHexPubkey,
  buildBookRecordsHeaderAddress,
  toBookRecordEvent,
  toWireTemplate,
  type BookRecord,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import { buildBookDocument } from "../src/build-document";
import { MeiliProvider } from "../src/meili";

const LIB = asHexPubkey("1".repeat(63) + "a");
const HDR = buildBookRecordsHeaderAddress(LIB);

function recordEvent(slug: string, extraTags: string[][] = []): SignedNostrEvent {
  const rec: BookRecord = {
    slug,
    title: "Orbital",
    authorName: "Samantha Harvey",
    format: "reference",
    source: "community",
    parentHeader: HDR,
    publishYear: 2023,
  };
  const t = toWireTemplate(toBookRecordEvent(rec), 1_700_000_000);
  return {
    id: slug,
    pubkey: LIB,
    sig: "x",
    ...t,
    tags: [...t.tags, ...extraTags],
  } as unknown as SignedNostrEvent;
}

describe("buildBookDocument — delisted records are never indexed (ADR 0078 §1)", () => {
  it("returns a document for a normal record (the control)", () => {
    const doc = buildBookDocument(recordEvent("orbital--x"), [], [], 2026);
    expect(doc?.id).toBe("orbital--x");
  });

  it("returns null for a delisted record EVEN when the payload still parses (predicate, not parse luck)", () => {
    const delisted = recordEvent("orbital--x", [["delisted", "true"]]);
    expect(buildBookDocument(delisted, [], [], 2026)).toBeNull();
  });
});

describe("MeiliProvider.delete (ADR 0078 §3)", () => {
  function captureFetch(status = 200) {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fn = vi.fn(async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({}), { status });
    }) as unknown as typeof fetch;
    return { fn, calls };
  }

  it("posts the ids to the documents delete-batch endpoint", async () => {
    const { fn, calls } = captureFetch();
    const provider = new MeiliProvider(
      { url: "http://localhost:7700", apiKey: "test-key" },
      fn,
    );
    await provider.delete(["orbital--x"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("/documents/delete-batch");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual(["orbital--x"]);
  });

  it("no ids → no request (cheap no-op)", async () => {
    const { fn, calls } = captureFetch();
    const provider = new MeiliProvider(
      { url: "http://localhost:7700", apiKey: "test-key" },
      fn,
    );
    await provider.delete([]);
    expect(calls).toHaveLength(0);
  });

  it("a non-ok response throws (the caller decides to swallow)", async () => {
    const { fn } = captureFetch(500);
    const provider = new MeiliProvider(
      { url: "http://localhost:7700", apiKey: "test-key" },
      fn,
    );
    await expect(provider.delete(["orbital--x"])).rejects.toThrow(/delete/i);
  });
});
