import { describe, expect, it } from "vitest";
import { getPublicKey, generateSecretKey } from "nostr-tools/pure";
import { asHexPubkey } from "@unbnd/schemas";
import type { Config } from "../../src/config";
import {
  buildRatingTemplate,
  RatingError,
} from "../../src/ratings/template";
import { LIBRARIAN } from "./_fixtures";

const baseConfig: Config = {
  port: 8787,
  strfryUrl: "ws://localhost:7777",
  neo4jBoltUrl: "bolt://localhost:7687",
  neo4jUser: "neo4j",
  neo4jPassword: "x",
  tapestryApiUrl: "http://localhost:8080",
  searchUrl: "http://localhost:7700",
  searchApiKey: "x",
  searchProvider: "meili",
  databaseUrl: "postgres://x:x@localhost:5432/x",
  backupEncryptionKey: "a".repeat(64),
  publicOrigin: "http://localhost:5181",
  librarianPubkey: LIBRARIAN,
};

const RATER = asHexPubkey(getPublicKey(generateSecretKey()));
const CREATED_AT = 1_716_800_000;

const input = {
  raterPubkey: RATER,
  bookSlug: "orbital",
  score: 4,
  reviewText: "Quietly extraordinary.",
  reviewDate: "2026-05-27",
};

describe("buildRatingTemplate", () => {
  it("builds a kind-39999 template with the rater pubkey and review text", () => {
    const t = buildRatingTemplate(baseConfig, input, CREATED_AT);
    expect(t.kind).toBe(39999);
    expect(t.created_at).toBe(CREATED_AT);
    expect(t.content).toBe("Quietly extraordinary.");
  });

  it("anchors the z-tag and a-tag at the librarian pubkey from config", () => {
    const t = buildRatingTemplate(baseConfig, input, CREATED_AT);
    expect(t.tags).toContainEqual(["z", `39998:${LIBRARIAN}:book-ratings`]);
    expect(t.tags).toContainEqual(["a", `39999:${LIBRARIAN}:orbital`]);
    expect(t.tags).toContainEqual([
      "d",
      `rating--orbital--${RATER.slice(0, 8)}`,
    ]);
    expect(t.tags).toContainEqual(["p", RATER]);
    expect(t.tags.find((tag) => tag[0] === "json")).toBeDefined();
  });

  it("rejects a score outside 1..5", () => {
    for (const score of [0, 6, 2.5, -1]) {
      let err: unknown;
      try {
        buildRatingTemplate(baseConfig, { ...input, score }, CREATED_AT);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(RatingError);
      expect((err as RatingError).code).toBe("score_out_of_range");
    }
  });

  it("reports the feature unavailable when no librarian pubkey is configured", () => {
    const { librarianPubkey: _omit, ...noLibrarian } = baseConfig;
    let err: unknown;
    try {
      buildRatingTemplate(noLibrarian as Config, input, CREATED_AT);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(RatingError);
    expect((err as RatingError).code).toBe("feature_unavailable");
  });
});
