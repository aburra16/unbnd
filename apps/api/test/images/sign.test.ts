// Story 111 / ADR 0099 §2: imgproxy URL signing, checked against imgproxy's
// own worked example (docs.imgproxy.net, "Signing a URL").
import { describe, expect, it } from "vitest";
import { imageProxyUrl, signImgproxyPath } from "../../src/images/sign";

describe("imgproxy signatures", () => {
  it("matches imgproxy's documented example", () => {
    const path = "/rs:fill:300:400:0/g:sm/aHR0cDovL2V4YW1w/bGUuY29tL2ltYWdl/cy9jdXJpb3NpdHku/anBn.png";
    expect(signImgproxyPath(path, { key: "736563726574", salt: "68656C6C6F" })).toBe("oKfUtW34Dvo2BGQehJFR4Nr0_rIjOtdtzJ3QFsUcXH8");
  });

  it("builds a /img URL for a preset, as WebP, with the source in URL-safe Base64", () => {
    const keys = { key: "736563726574", salt: "68656C6C6F" };
    const src = "https://covers.openlibrary.org/b/id/4980580-L.jpg?a=1&b=2";
    const url = imageProxyUrl(src, "cover", keys);
    const m = url.match(/^\/img\/([A-Za-z0-9_-]{43})\/cover\/([A-Za-z0-9_-]+)\.webp$/);
    expect(m).not.toBeNull();
    expect(Buffer.from(m![2]!, "base64url").toString()).toBe(src);
    expect(m![1]).toBe(signImgproxyPath(`/cover/${m![2]}.webp`, keys));
  });
});
