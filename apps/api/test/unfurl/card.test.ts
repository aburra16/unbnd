// Story 72 / ADR 0070 — the PURE unfurl card model + renderers. No I/O. These
// cover the rating label (AC-2/AC-5), raw-only (AC-4), top-tags selection, the
// OG/Twitter/oEmbed-discovery HTML, the oEmbed JSON (AC-3), and — critically —
// HTML/attribute escaping of book-derived strings (security, ADR 0070).
//
// FAILING until `apps/api/src/unfurl/card.ts` is implemented (it currently stubs).
import { describe, expect, it } from "vitest";
import type { PublicBook } from "../../src/books/effective";
import type { RawBookTags, RawTagConsensus } from "../../src/tags/aggregate";
import {
  buildBookCard,
  renderUnfurlHtml,
  renderGenericHtml,
  toOEmbed,
  type BookCard,
} from "../../src/unfurl/card";

const BASE = "https://unbnd.test";

function book(overrides: Partial<PublicBook> = {}): PublicBook {
  return {
    slug: "the-salt-houses",
    title: "The Salt Houses",
    authorName: "Hala Alyan",
    source: "openlibrary",
    blurb: "A family across generations.",
    coverUrl: "https://covers.example/salt.jpg",
    publishYear: 2017,
    pageCount: 320,
    language: "en",
    subjects: ["Fiction"],
    openLibraryId: "OL1W",
    isbn13: "9780000000001",
    purchaseUrl: "https://buy.example/salt",
    format: "reference",
    ...overrides,
  };
}

function tag(
  type: RawTagConsensus["type"],
  slug: string,
  name: string,
  applies: number,
  disputes: number,
): RawTagConsensus {
  return { slug, name, type, applies, disputes };
}

function tags(over: Partial<RawBookTags> = {}): RawBookTags {
  return { genres: [], styles: [], signals: [], ...over };
}

describe("buildBookCard — rating label (AC-2 / AC-5) and raw-only (AC-4)", () => {
  it("formats the raw rating label when there are ratings", () => {
    const card = buildBookCard(book(), { count: 12, average: 4.25 }, tags(), BASE);
    expect(card.ratingLabel).toMatch(/4\.2|4\.3/); // toFixed(1) of 4.25
    expect(card.ratingLabel).toContain("12");
  });

  it("returns a null rating label when there are no ratings (honest-empty, no fake 0.0)", () => {
    const card = buildBookCard(book(), { count: 0, average: null }, tags(), BASE);
    expect(card.ratingLabel).toBeNull();
  });

  it("never carries a trust/observer-weighted number — the card is raw by construction", () => {
    // buildBookCard takes no observer/weights argument; the label is the raw avg.
    const card = buildBookCard(book(), { count: 3, average: 5 }, tags(), BASE);
    expect(card.ratingLabel).toContain("5.0");
    expect(JSON.stringify(card)).not.toMatch(/trust|tier|weighted/i);
  });

  it("builds the canonical URL from the base and slug", () => {
    const card = buildBookCard(book({ slug: "orbital" }), { count: 0, average: null }, tags(), BASE);
    expect(card.canonicalUrl).toBe(`${BASE}/book/orbital`);
  });
});

describe("buildBookCard — top tags selection", () => {
  it("takes the top 3 net-positive tags ranked by (applies − disputes)", () => {
    const card = buildBookCard(
      book(),
      { count: 5, average: 4 },
      tags({
        genres: [tag("genre", "litfic", "Literary Fiction", 9, 1)], // net 8
        styles: [tag("style", "lyrical", "Lyrical", 5, 0)], // net 5
        signals: [
          tag("signal", "award", "Award Winner", 7, 0), // net 7
          tag("signal", "slow", "Slow Burn", 2, 3), // net -1 → excluded
        ],
      }),
      BASE,
    );
    expect(card.topTags).toEqual(["Literary Fiction", "Award Winner", "Lyrical"]);
  });

  it("excludes tags whose disputes meet or exceed applies (no net-positive consensus)", () => {
    const card = buildBookCard(
      book(),
      { count: 5, average: 4 },
      tags({ genres: [tag("genre", "contested", "Contested", 2, 2)] }),
      BASE,
    );
    expect(card.topTags).toEqual([]);
  });
});

describe("renderUnfurlHtml — Open Graph / Twitter / oEmbed discovery (AC-1/AC-2/AC-3)", () => {
  const card: BookCard = {
    slug: "the-salt-houses",
    title: "The Salt Houses",
    authorName: "Hala Alyan",
    coverUrl: "https://covers.example/salt.jpg",
    ratingLabel: "★ 4.2 · 12 ratings",
    topTags: ["Literary Fiction", "Award Winner"],
    canonicalUrl: `${BASE}/book/the-salt-houses`,
  };

  it("emits per-book og:title, og:url, and an absolute og:image", () => {
    const html = renderUnfurlHtml(card, BASE);
    expect(html).toContain('property="og:title"');
    expect(html).toContain("The Salt Houses");
    expect(html).toContain('property="og:url"');
    expect(html).toContain(`${BASE}/book/the-salt-houses`);
    expect(html).toContain('property="og:image"');
    expect(html).toContain("https://covers.example/salt.jpg");
  });

  it("puts the author, raw rating, and tags into og:description", () => {
    const html = renderUnfurlHtml(card, BASE);
    const desc = html.match(/property="og:description"\s+content="([^"]*)"/)?.[1] ?? "";
    expect(desc).toContain("Hala Alyan");
    expect(desc).toContain("4.2");
    expect(desc).toContain("Literary Fiction");
  });

  it("advertises a machine-discoverable oEmbed link to the canonical book URL", () => {
    const html = renderUnfurlHtml(card, BASE);
    expect(html).toMatch(/rel="alternate"[^>]*type="application\/json\+oembed"/);
    expect(html).toContain(encodeURIComponent(`${BASE}/book/the-salt-houses`));
  });

  it("uses summary_large_image when a cover exists and summary when it does not", () => {
    expect(renderUnfurlHtml(card, BASE)).toContain("summary_large_image");
    const noCover = renderUnfurlHtml({ ...card, coverUrl: null }, BASE);
    expect(noCover).toMatch(/name="twitter:card"\s+content="summary"/);
  });

  it("omits the rating from og:description when the card has no rating", () => {
    const html = renderUnfurlHtml({ ...card, ratingLabel: null }, BASE);
    const desc = html.match(/property="og:description"\s+content="([^"]*)"/)?.[1] ?? "";
    expect(desc).not.toMatch(/★|ratings/);
  });
});

describe("renderUnfurlHtml — escapes book-derived strings (security, ADR 0070)", () => {
  it("HTML/attribute-escapes a hostile title so no raw markup reaches the document", () => {
    const card: BookCard = {
      slug: "x",
      title: 'Dragons & "Quotes" <script>alert(1)</script>',
      authorName: "A & B",
      coverUrl: null,
      ratingLabel: null,
      topTags: [],
      canonicalUrl: `${BASE}/book/x`,
    };
    const html = renderUnfurlHtml(card, BASE);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
    // The og:title attribute must not be broken out of by a raw double-quote.
    expect(html).toContain("&quot;Quotes&quot;");
  });
});

describe("renderGenericHtml — the no-book fallback (AC-6)", () => {
  it("emits the generic site card with no fabricated book-specific title", () => {
    const html = renderGenericHtml(BASE);
    expect(html).toContain('property="og:title"');
    expect(html).toContain("Unbnd");
    expect(html).not.toContain("og:type");
  });
});

describe("toOEmbed — oEmbed 1.0 link payload (AC-3 / AC-4)", () => {
  const card: BookCard = {
    slug: "the-salt-houses",
    title: "The Salt Houses",
    authorName: "Hala Alyan",
    coverUrl: "https://covers.example/salt.jpg",
    ratingLabel: "★ 4.2 · 12 ratings",
    topTags: ["Literary Fiction"],
    canonicalUrl: `${BASE}/book/the-salt-houses`,
  };

  it("returns a version-1.0 link type with provider, title, author, and thumbnail", () => {
    const o = toOEmbed(card) as Record<string, unknown>;
    expect(o.version).toBe("1.0");
    expect(o.type).toBe("link");
    expect(o.provider_name).toBe("Unbnd");
    expect(o.title).toBe("The Salt Houses");
    expect(o.author_name).toBe("Hala Alyan");
    expect(o.thumbnail_url).toBe("https://covers.example/salt.jpg");
  });

  it("never returns an embeddable html field (no injection surface) and no trust number", () => {
    const o = toOEmbed(card) as Record<string, unknown>;
    expect(o).not.toHaveProperty("html");
    expect(JSON.stringify(o)).not.toMatch(/trust|tier|weighted/i);
  });

  it("omits the rating field when the card has no rating", () => {
    const o = toOEmbed({ ...card, ratingLabel: null }) as Record<string, unknown>;
    expect(o.rating).toBeUndefined();
  });
});
