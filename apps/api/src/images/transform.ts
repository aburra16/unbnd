// Proxied image URLs in every /api JSON body (Story 111 / ADR 0099 §3). Books
// reach the client through many routes and are merged with author overlays
// late, so the response is the one place every final cover passes through.
// Beside each http(s) `coverUrl` it adds `coverImage`, beside each `picture`
// `pictureImage`; the originals are untouched, so the client can fall back.
import type { RequestHandler } from "express";
import type { ImagePreset } from "./sign";

export type ImageSigner = (src: string, preset: ImagePreset) => string;

const FIELDS: ReadonlyArray<readonly [string, string, ImagePreset]> = [
  ["coverUrl", "coverImage", "cover"],
  ["picture", "pictureImage", "avatar"],
];

const isHttp = (v: unknown): v is string => typeof v === "string" && /^https?:\/\//i.test(v);

/** A copy of `value` with proxied image URLs added; `value` is not changed. */
export function addImageUrls(value: unknown, sign: ImageSigner): unknown {
  if (Array.isArray(value)) return value.map((v) => addImageUrls(v, sign));
  if (value === null || typeof value !== "object") return value;
  // Only plain objects are rebuilt; a Date or anything with its own toJSON
  // passes through as it is.
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    // defineProperty keeps a "__proto__" key from user data an own key.
    Object.defineProperty(out, k, { value: addImageUrls(v, sign), enumerable: true, writable: true, configurable: true });
  }
  for (const [from, to, preset] of FIELDS) {
    if (isHttp(out[from]) && out[to] === undefined) out[to] = sign(out[from] as string, preset);
  }
  return out;
}

/** Adds the URLs to `res.json` bodies; does nothing without a signer. */
export function imageUrlsMiddleware(sign: ImageSigner | undefined): RequestHandler {
  return (_req, res, next) => {
    if (sign) {
      const json = res.json.bind(res);
      res.json = (body?: unknown) => json(addImageUrls(body, sign));
    }
    next();
  };
}
