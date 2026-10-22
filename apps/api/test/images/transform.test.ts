// Story 111 / ADR 0099 §3: JSON under /api gains proxied image URLs beside
// every http(s) coverUrl and picture.
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { addImageUrls, imageUrlsMiddleware } from "../../src/images/transform";

const sign = (src: string, preset: "cover" | "avatar") => `/img/sig/${preset}/${Buffer.from(src).toString("base64url")}.webp`;

describe("addImageUrls", () => {
  it("adds coverImage and pictureImage beside http(s) URLs, at any depth", () => {
    const body = {
      book: { slug: "a", coverUrl: "https://covers.openlibrary.org/b/id/1-L.jpg" },
      hits: [{ coverUrl: "https://x/c.jpg" }, { coverUrl: undefined }],
      profile: { npub: "npub1", picture: "https://x/p.gif" },
    };
    const out = addImageUrls(body, sign) as typeof body & Record<string, any>;
    expect(out.book).toMatchObject({ coverUrl: body.book.coverUrl, coverImage: sign(body.book.coverUrl, "cover") });
    expect((out.hits[0] as any).coverImage).toBe(sign("https://x/c.jpg", "cover"));
    expect(out.hits[1]).not.toHaveProperty("coverImage");
    expect((out.profile as any).pictureImage).toBe(sign("https://x/p.gif", "avatar"));
  });

  it("leaves non-http values alone and does not change the body it was given", () => {
    const body = { a: { coverUrl: "javascript:alert(1)" }, b: { picture: "data:image/png;base64,AAAA" }, c: { coverUrl: "https://x/c.jpg" } };
    const before = JSON.stringify(body);
    const out = addImageUrls(body, sign) as any;
    expect(out.a).not.toHaveProperty("coverImage");
    expect(out.b).not.toHaveProperty("pictureImage");
    expect(out.c.coverImage).toBeDefined();
    expect(JSON.stringify(body)).toBe(before);
  });
});

describe("imageUrlsMiddleware", () => {
  const app = (signer: typeof sign | undefined) => {
    const a = express();
    a.use("/api", imageUrlsMiddleware(signer));
    a.get("/api/book", (_req, res) => void res.json({ book: { coverUrl: "https://x/c.jpg" } }));
    return a;
  };

  it("adds the URLs to JSON responses", async () => {
    const res = await request(app(sign)).get("/api/book");
    expect(res.body.book.coverImage).toBe(sign("https://x/c.jpg", "cover"));
  });

  it("adds nothing when the proxy is not configured", async () => {
    const res = await request(app(undefined)).get("/api/book");
    expect(res.body.book).toEqual({ coverUrl: "https://x/c.jpg" });
  });
});
