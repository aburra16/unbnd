// FAILING TESTS — Story 80 / ADR 0078 (the catalog read seam).
//
// `parseBook` returns null for a DELISTED record, so the whole read surface
// inherits: detail 404s, browse filters, ?slugs= hydration (homepage shelves /
// For-You) skips. The delisted fixture is a fully PARSEABLE record carrying the
// marker, pinning that the predicate (not parse failure) drives the null.
// Also pins the additive `PublicBook.source` (the web affordance's
// community-only gate needs it).
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  asHexPubkey,
  buildBookRecordsHeaderAddress,
  toBookRecordEvent,
  toWireTemplate,
  type BookRecord,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type { Config } from "../../src/config";
import { buildBooksRouter, type BooksDeps } from "../../src/routes/books";

const LIB = asHexPubkey("1".repeat(63) + "a");
const HDR = buildBookRecordsHeaderAddress(LIB);
const cfg = { librarianPubkey: LIB } as unknown as Config;

function bookEvent(
  slug: string,
  opts: { source?: BookRecord["source"]; delisted?: boolean; createdAt?: number } = {},
): SignedNostrEvent {
  const rec: BookRecord = {
    slug,
    title: `Title of ${slug}`,
    authorName: "Samantha Harvey",
    format: "reference",
    source: opts.source ?? "community",
    parentHeader: HDR,
    publishYear: 2023,
  };
  const t = toWireTemplate(toBookRecordEvent(rec), opts.createdAt ?? 1);
  const tags = opts.delisted ? [...t.tags, ["delisted", "true"]] : t.tags;
  return { id: slug, pubkey: LIB, sig: "x", ...t, tags } as unknown as SignedNostrEvent;
}

function bookOnly(...books: SignedNostrEvent[]) {
  return vi.fn(async (filter: Record<string, unknown>): Promise<SignedNostrEvent[]> => {
    const z = ((filter["#z"] as string[]) ?? [])[0] ?? "";
    if (z.endsWith("book-claims") || z.endsWith("author-verified") || z.endsWith("author-edits")) {
      return [];
    }
    const slugs = filter["#d"] as string[] | undefined;
    if (slugs) return books.filter((b) => slugs.includes((b as { id: string }).id));
    return books;
  });
}

function makeApp(over: Partial<BooksDeps> = {}) {
  const deps = { config: cfg, query: vi.fn(async () => []), ...over } as unknown as BooksDeps;
  const app = express();
  app.use("/", buildBooksRouter(deps));
  return { app };
}

describe("delisted records leave every catalog read (ADR 0078 §1)", () => {
  it("detail: a delisted record 404s EVEN when its payload still parses (predicate, not parse luck)", async () => {
    const { app } = makeApp({ query: bookOnly(bookEvent("gone--x", { delisted: true })) });
    const res = await request(app).get("/api/books/gone--x");
    expect(res.status).toBe(404);
  });

  it("browse: a delisted record is filtered out; its neighbors remain", async () => {
    const { app } = makeApp({
      query: bookOnly(bookEvent("kept--a"), bookEvent("gone--x", { delisted: true })),
    });
    const res = await request(app).get("/api/books");
    expect(res.status).toBe(200);
    const slugs = (res.body.books as Array<{ slug: string }>).map((b) => b.slug);
    expect(slugs).toContain("kept--a");
    expect(slugs).not.toContain("gone--x");
  });

  it("?slugs= hydration (homepage shelves / For-You) skips a delisted slug", async () => {
    const { app } = makeApp({
      query: bookOnly(bookEvent("kept--a"), bookEvent("gone--x", { delisted: true })),
    });
    const res = await request(app).get("/api/books?slugs=kept--a,gone--x");
    expect(res.status).toBe(200);
    const slugs = (res.body.books as Array<{ slug: string }>).map((b) => b.slug);
    expect(slugs).toEqual(["kept--a"]);
  });
});

describe("PublicBook.source (the web affordance's community-only gate)", () => {
  it("detail carries source for a community record", async () => {
    const { app } = makeApp({ query: bookOnly(bookEvent("orbital--x", { source: "community" })) });
    const res = await request(app).get("/api/books/orbital--x");
    expect(res.status).toBe(200);
    expect(res.body.book.source).toBe("community");
  });

  it("detail carries source for a seeded record", async () => {
    const { app } = makeApp({ query: bookOnly(bookEvent("seeded--y", { source: "openlibrary" })) });
    const res = await request(app).get("/api/books/seeded--y");
    expect(res.status).toBe(200);
    expect(res.body.book.source).toBe("openlibrary");
  });
});
