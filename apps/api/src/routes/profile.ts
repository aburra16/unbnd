// Public profile metadata (ADR 0012): given an npub or hex pubkey, resolve the
// user's kind-0 (name, picture, nip05) best-effort from public relays. Always
// returns at least the npub so the client can render an initials avatar.
// Lookups go through the profile cache (ADR 0098).
import express, { type Router } from "express";
import { npubEncode } from "nostr-tools/nip19";
import type { Config } from "../config";
import { fetchProfileMeta, type ProfileMeta } from "../nostr/profile";
import { createProfileCache, type ProfileCache } from "../profile/cache";
import { toHex } from "../nostr/npub";

export type ProfileDeps = {
  readonly config: Config;
  // Injectable for tests; defaults to the real relay fan-out.
  readonly resolve?: (pubkeyHex: string) => Promise<ProfileMeta | null>;
  // Shared with the kind-0 publish so a profile Unbnd writes is served as written.
  readonly cache?: ProfileCache;
};

export function buildProfileRouter(deps: ProfileDeps): Router {
  const router = express.Router();
  const cache =
    deps.cache ??
    createProfileCache({
      resolve:
        deps.resolve ??
        ((hex: string) => fetchProfileMeta(deps.config.profileRelays ?? [], hex)),
    });

  router.get("/api/profile/:id", async (req, res, next) => {
    try {
      const hex = toHex(req.params.id);
      if (!hex) {
        return void res
          .status(400)
          .json({ error: { code: "invalid_pubkey", message: "Expected an npub or hex pubkey." } });
      }
      const npub = npubEncode(hex);
      const meta = await cache.get(hex);
      res.status(200).json({ profile: { npub, ...(meta ?? {}) } });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
