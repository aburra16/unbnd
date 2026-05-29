// Public profile metadata (ADR 0012): given an npub or hex pubkey, resolve the
// user's kind-0 (name, picture, nip05) best-effort from public relays. Always
// returns at least the npub so the client can render an initials avatar.
import express, { type Router } from "express";
import { decode, npubEncode } from "nostr-tools/nip19";
import type { Config } from "../config";
import { fetchProfileMeta, type ProfileMeta } from "../nostr/profile";

const HEX64 = /^[0-9a-f]{64}$/i;

export type ProfileDeps = {
  readonly config: Config;
  // Injectable for tests; defaults to the real relay fan-out.
  readonly resolve?: (pubkeyHex: string) => Promise<ProfileMeta | null>;
};

/** Normalise an npub (bech32) or hex string to a lowercase hex pubkey. */
function toHex(id: string): string | null {
  if (HEX64.test(id)) return id.toLowerCase();
  try {
    const d = decode(id);
    if (d.type === "npub" && typeof d.data === "string") return d.data;
  } catch {
    // not a valid npub
  }
  return null;
}

export function buildProfileRouter(deps: ProfileDeps): Router {
  const router = express.Router();
  const resolve =
    deps.resolve ??
    ((hex: string) => fetchProfileMeta(deps.config.profileRelays ?? [], hex));

  router.get("/api/profile/:id", async (req, res, next) => {
    try {
      const hex = toHex(req.params.id);
      if (!hex) {
        return void res
          .status(400)
          .json({ error: { code: "invalid_pubkey", message: "Expected an npub or hex pubkey." } });
      }
      const npub = npubEncode(hex);
      const meta = await resolve(hex).catch(() => null);
      res.status(200).json({ profile: { npub, ...(meta ?? {}) } });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
