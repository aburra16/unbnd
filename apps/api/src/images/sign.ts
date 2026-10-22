// Signed imgproxy URLs (Story 111 / ADR 0099 §2). imgproxy serves only URLs
// carrying a valid signature: URL-safe Base64 of HMAC-SHA256 over the salt and
// the path, keyed by the key (both hex). That keeps the proxy from fetching
// and resizing arbitrary images for anyone. HMAC comes from node:crypto.
import { createHmac } from "node:crypto";

export type ImageProxyKeys = { readonly key: string; readonly salt: string };
export type ImagePreset = "cover" | "avatar";

/** imgproxy's signature for a path that starts with "/". */
export function signImgproxyPath(path: string, keys: ImageProxyKeys): string {
  return createHmac("sha256", Buffer.from(keys.key, "hex"))
    .update(Buffer.from(keys.salt, "hex"))
    .update(path)
    .digest("base64url");
}

/** The /img URL for one source image through one preset, as WebP. */
export function imageProxyUrl(src: string, preset: ImagePreset, keys: ImageProxyKeys): string {
  const path = `/${preset}/${Buffer.from(src).toString("base64url")}.webp`;
  return `/img/${signImgproxyPath(path, keys)}${path}`;
}
