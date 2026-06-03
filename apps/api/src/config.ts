// Env-var validation per ADR 0002.
import type { FixtureSpec, TrustProviderName } from "./trust";

export type Config = {
  readonly port: number;
  readonly strfryUrl: string;
  readonly neo4jBoltUrl: string;
  readonly neo4jUser: string;
  readonly neo4jPassword: string;
  readonly tapestryApiUrl: string;
  readonly searchUrl: string;
  readonly searchApiKey: string;
  readonly searchProvider: "meili" | "vespa";
  readonly databaseUrl: string;
  /** 32-byte server-managed backup key, hex-encoded (64 hex chars). */
  readonly backupEncryptionKey: string;
  /** Public origin of the web app, used as the NIP-42 relay tag on auth challenges. */
  readonly publicOrigin: string;
  /**
   * Hex pubkey of the librarian/house identity that owns the kind-39998
   * concept headers. Used to build a rating's z-tag (parent header) and `a`
   * tag (book record address). Optional: when unset, the rating endpoints
   * report the feature as unavailable. ADR 0005.
   */
  readonly librarianPubkey?: string;
  /**
   * Shared relay (dcosl) that community writes are propagated TO, so ratings
   * and tag assertions become globally visible and durable beyond the local
   * relay. Optional: unset → no propagation (fail-safe for dev/test). ADR 0011.
   */
  readonly dcoslRelayUrl?: string;
  /**
   * Whether the API dual-publishes accepted writes to dcosl. Always set by
   * `loadConfig` (derived from `dcoslRelayUrl` + `PROPAGATE_WRITES`); optional
   * here only so partial test fixtures need not set it. ADR 0011.
   */
  readonly propagateWrites?: boolean;
  /**
   * Public relays queried (best-effort) for a pubkey's kind-0 profile metadata
   * — sovereign users' name/picture live on the broad network, not dcosl.
   * Always set by `loadConfig`; optional here so partial test fixtures need
   * not set it. ADR 0012.
   */
  readonly profileRelays?: readonly string[];
  /** Trust-score backend (ADR 0014/0017). `fixture` = deterministic, no network. */
  readonly trustProvider: TrustProviderName;
  /** Brainstorm API base for resolving an observer's trust-score source. ADR 0014. */
  readonly brainstormApiUrl?: string;
  /** nip85 relays unioned when reading trust-score events. ADR 0014. */
  readonly trustRelays?: readonly string[];
  /** Deterministic fixture spec; required + used when trustProvider==="fixture". ADR 0017. */
  readonly trustFixture?: FixtureSpec;
  /** Default "house" observer pubkey (hex) whose vantage powers the default view. */
  readonly houseObserverPubkey?: string;
  /**
   * Minimum distinct kind-3 follow count a custodial user needs before the
   * in-session Personalize trigger is offered/allowed (ADR 0026). Default 10
   * (PRD §9.5 "ten follows"). Staging may override to 1 or 2
   * (`PERSONALIZE_MIN_FOLLOWS=1`) so the flow is exercisable without recruiting
   * ten real follows. Always set by `loadConfig`; optional here only so partial
   * test fixtures need not set it (mirrors `propagateWrites`/`profileRelays`).
   */
  readonly personalizeMinFollows?: number;
  /**
   * The emergent curator gate (ADR 0031): a session user clears the gate when
   * their own GrapeRank weight from the house observer's vantage is ≥ this
   * threshold. Env `CURATOR_THRESHOLD`, validated in (0,1] (GrapeRank weights are
   * clamped to that range). Default 0.5 (conservative, non-zero); calibrated on
   * staging. Always set by `loadConfig`; optional here so partial test fixtures
   * need not set it.
   */
  readonly curatorThreshold?: number;
  /**
   * The verification count-gate head count (ADR 0033 §7): a claim is Verified
   * when ≥ this many distinct curators (each at/above `curatorThreshold`, the
   * author excluded) have net-asserted `author-verified`. Env
   * `VERIFIED_AUTHOR_MIN_CURATORS`, validated as a positive integer ≥ 1, default
   * 2. The per-curator weight floor reuses `curatorThreshold` (no new weight
   * env). Always set by `loadConfig`; optional here so partial test fixtures
   * need not set it.
   */
  readonly verifiedAuthorMinCurators?: number;
  /**
   * The text-vs-trust search blend weight (Story 34 / ADR 0035). A single legible
   * knob in [0,1]: `final = (1−w)·normText + w·normTrust`. Env `SEARCH_TRUST_BLEND`,
   * validated in [0,1], default 0.25 (conservative, text-leaning); `w=0` is a
   * meaningful no-op (pure text relevance). Always set by `loadConfig`; optional
   * here only so partial test fixtures need not set it (mirrors `curatorThreshold`).
   */
  readonly searchTrustBlend?: number;
  /**
   * The For-You "highly rated" bar (Story 36 / ADR 0037 §7). A book qualifies for
   * a user's For-You shelf only when its trust-weighted average from the user's own
   * vantage is at/above this value. Env `FORYOU_MIN_AVG`, validated finite in [1,5]
   * (the rating scale), default 4.0 (a high, honest "highly rated" bar). Always set
   * by `loadConfig`; optional here only so partial test fixtures need not set it
   * (mirrors `searchTrustBlend`).
   */
  readonly foryouMinAvg?: number;
  /**
   * The For-You minimum trusted-rating count (Story 36 / ADR 0037 §7). A book
   * qualifies only when at least this many raters carry positive weight in the
   * user's graph, so a lone trusted 5-star never qualifies. Env `FORYOU_MIN_RATINGS`,
   * validated as an integer ≥ 1, default 2 (mirrors `SHELF_FAVORITES_MIN_RATINGS`
   * from the user's sparser vantage). Always set by `loadConfig`; optional here.
   */
  readonly foryouMinRatings?: number;
  /**
   * The For-You row length (Story 36 / ADR 0037 §7). Caps the shelf at this many
   * books. Env `FORYOU_BOOKS`, validated as an integer ≥ 1, default 12 (one Shelf
   * row). Always set by `loadConfig`; optional here.
   */
  readonly foryouBooks?: number;
  /**
   * The For-You candidate-rater cap (Story 36 / ADR 0037 §7). Bounds the single
   * batched `weights` array so the read stays O(bounded) on a future dense graph.
   * Env `FORYOU_CANDIDATE_RATERS`, validated as an integer ≥ 1, default 2000 (a
   * no-op on today's thin graph). Always set by `loadConfig`; optional here.
   */
  readonly foryouCandidateRaters?: number;
};

const DEFAULT_TRUST_RELAYS = [
  "wss://nip85.nosfabrica.com",
  "wss://nip85.brainstorm.world",
];
// nosfabrica (npub1health…) — a well-connected default house observer (ADR 0014).
const DEFAULT_HOUSE_OBSERVER =
  "be7bf5de068c1d842ed34a7c270507ec940f5ea51671cfd062a95e9d09420d0a";

const DEFAULT_PROFILE_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://nos.lol",
  "wss://relay.nostr.band",
];

const KNOWN_PROVIDERS: readonly Config["searchProvider"][] = ["meili", "vespa"];
const KNOWN_TRUST_PROVIDERS: readonly TrustProviderName[] = ["brainstorm", "fixture"];

function required(env: NodeJS.ProcessEnv, name: string): string {
  const v = env[name];
  if (v === undefined || v.length === 0) {
    throw new Error(`config: missing required env var ${name}`);
  }
  return v;
}

function withDefault(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: string,
): string {
  const v = env[name];
  return v === undefined || v.length === 0 ? fallback : v;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const neo4jPassword = required(env, "NEO4J_PASSWORD");
  const searchApiKey = required(env, "SEARCH_API_KEY");

  const providerRaw = withDefault(env, "SEARCH_PROVIDER", "meili");
  if (!KNOWN_PROVIDERS.includes(providerRaw as Config["searchProvider"])) {
    throw new Error(
      `config: SEARCH_PROVIDER must be one of ${KNOWN_PROVIDERS.join(", ")}; got ${JSON.stringify(providerRaw)}`,
    );
  }
  const searchProvider = providerRaw as Config["searchProvider"];

  const portRaw = withDefault(env, "PORT", "8787");
  const port = Number(portRaw);
  if (!Number.isFinite(port) || port <= 0 || !Number.isInteger(port)) {
    throw new Error(
      `config: PORT must be a positive integer; got ${JSON.stringify(portRaw)}`,
    );
  }

  const minFollowsRaw = withDefault(env, "PERSONALIZE_MIN_FOLLOWS", "10");
  const personalizeMinFollows = Number(minFollowsRaw);
  if (
    !Number.isFinite(personalizeMinFollows) ||
    personalizeMinFollows < 0 ||
    !Number.isInteger(personalizeMinFollows)
  ) {
    throw new Error(
      `config: PERSONALIZE_MIN_FOLLOWS must be a non-negative integer; got ${JSON.stringify(minFollowsRaw)}`,
    );
  }

  // Curator gate threshold (ADR 0031). Validated in (0,1]; default 0.5.
  const curatorThresholdRaw = withDefault(env, "CURATOR_THRESHOLD", "0.5");
  const curatorThreshold = Number(curatorThresholdRaw);
  if (!Number.isFinite(curatorThreshold) || curatorThreshold <= 0 || curatorThreshold > 1) {
    throw new Error(
      `config: CURATOR_THRESHOLD must be a number in (0,1]; got ${JSON.stringify(curatorThresholdRaw)}`,
    );
  }

  // Verification count-gate head count (ADR 0033 §7). Positive integer ≥ 1;
  // default 2. The per-curator weight floor reuses curatorThreshold.
  const minCuratorsRaw = withDefault(env, "VERIFIED_AUTHOR_MIN_CURATORS", "2");
  const verifiedAuthorMinCurators = Number(minCuratorsRaw);
  if (
    !Number.isFinite(verifiedAuthorMinCurators) ||
    verifiedAuthorMinCurators < 1 ||
    !Number.isInteger(verifiedAuthorMinCurators)
  ) {
    throw new Error(
      `config: VERIFIED_AUTHOR_MIN_CURATORS must be a positive integer ≥ 1; got ${JSON.stringify(minCuratorsRaw)}`,
    );
  }

  // Text-vs-trust search blend weight (ADR 0035). Validated in [0,1]; default
  // 0.25. 0 is a meaningful no-op (pure text relevance).
  const searchTrustBlendRaw = withDefault(env, "SEARCH_TRUST_BLEND", "0.25");
  const searchTrustBlend = Number(searchTrustBlendRaw);
  if (!Number.isFinite(searchTrustBlend) || searchTrustBlend < 0 || searchTrustBlend > 1) {
    throw new Error(
      `config: SEARCH_TRUST_BLEND must be a number in [0,1]; got ${JSON.stringify(searchTrustBlendRaw)}`,
    );
  }

  // For-You "highly rated" bar (ADR 0037 §7). Finite, in [1,5]; default 4.0.
  const foryouMinAvgRaw = withDefault(env, "FORYOU_MIN_AVG", "4.0");
  const foryouMinAvg = Number(foryouMinAvgRaw);
  if (!Number.isFinite(foryouMinAvg) || foryouMinAvg < 1 || foryouMinAvg > 5) {
    throw new Error(
      `config: FORYOU_MIN_AVG must be a number in [1,5]; got ${JSON.stringify(foryouMinAvgRaw)}`,
    );
  }

  // For-You minimum trusted-rating count (ADR 0037 §7). Integer ≥ 1; default 2.
  const foryouMinRatingsRaw = withDefault(env, "FORYOU_MIN_RATINGS", "2");
  const foryouMinRatings = Number(foryouMinRatingsRaw);
  if (
    !Number.isFinite(foryouMinRatings) ||
    foryouMinRatings < 1 ||
    !Number.isInteger(foryouMinRatings)
  ) {
    throw new Error(
      `config: FORYOU_MIN_RATINGS must be a positive integer ≥ 1; got ${JSON.stringify(foryouMinRatingsRaw)}`,
    );
  }

  // For-You row length (ADR 0037 §7). Integer ≥ 1; default 12.
  const foryouBooksRaw = withDefault(env, "FORYOU_BOOKS", "12");
  const foryouBooks = Number(foryouBooksRaw);
  if (!Number.isFinite(foryouBooks) || foryouBooks < 1 || !Number.isInteger(foryouBooks)) {
    throw new Error(
      `config: FORYOU_BOOKS must be a positive integer ≥ 1; got ${JSON.stringify(foryouBooksRaw)}`,
    );
  }

  // For-You candidate-rater cap (ADR 0037 §7). Integer ≥ 1; default 2000.
  const foryouCandidateRatersRaw = withDefault(env, "FORYOU_CANDIDATE_RATERS", "2000");
  const foryouCandidateRaters = Number(foryouCandidateRatersRaw);
  if (
    !Number.isFinite(foryouCandidateRaters) ||
    foryouCandidateRaters < 1 ||
    !Number.isInteger(foryouCandidateRaters)
  ) {
    throw new Error(
      `config: FORYOU_CANDIDATE_RATERS must be a positive integer ≥ 1; got ${JSON.stringify(foryouCandidateRatersRaw)}`,
    );
  }

  const databaseUrl = required(env, "DATABASE_URL");

  const backupEncryptionKey = required(env, "BACKUP_ENCRYPTION_KEY");
  if (!/^[0-9a-f]{64}$/.test(backupEncryptionKey)) {
    throw new Error(
      "config: BACKUP_ENCRYPTION_KEY must be 64 lowercase hex characters (32 bytes)",
    );
  }

  const librarianPubkeyRaw = env.LIBRARIAN_PUBKEY;
  const librarianPubkey =
    librarianPubkeyRaw === undefined || librarianPubkeyRaw.length === 0
      ? undefined
      : librarianPubkeyRaw;
  if (librarianPubkey !== undefined && !/^[0-9a-f]{64}$/.test(librarianPubkey)) {
    throw new Error(
      "config: LIBRARIAN_PUBKEY must be 64 lowercase hex characters when set",
    );
  }

  // dcosl propagation target (ADR 0011). No default: dev/test must opt in via
  // DCOSL_RELAY_URL, so a local run can't accidentally write to production dcosl.
  const dcoslRaw = env.DCOSL_RELAY_URL;
  const dcoslRelayUrl =
    dcoslRaw === undefined || dcoslRaw.length === 0 ? undefined : dcoslRaw;
  if (dcoslRelayUrl !== undefined && !/^wss?:\/\//.test(dcoslRelayUrl)) {
    throw new Error(
      "config: DCOSL_RELAY_URL must be a ws:// or wss:// URL when set",
    );
  }
  const propagateWrites =
    dcoslRelayUrl !== undefined &&
    withDefault(env, "PROPAGATE_WRITES", "true") !== "false";

  // kind-0 profile relays (ADR 0012). Comma-separated override; dcosl appended
  // so we also catch metadata that happens to live there.
  const profileRelaysRaw = env.PROFILE_RELAYS;
  const profileRelays =
    profileRelaysRaw && profileRelaysRaw.length > 0
      ? profileRelaysRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : [...DEFAULT_PROFILE_RELAYS, ...(dcoslRelayUrl ? [dcoslRelayUrl] : [])];

  // Trust-weighting (ADR 0014). Sensible defaults so it's on in prod; a blank
  // HOUSE_OBSERVER_PUBKEY disables the house-weighted default (fail-safe to raw).
  const trustRelaysRaw = env.TRUST_RELAYS;
  const trustRelays =
    trustRelaysRaw && trustRelaysRaw.length > 0
      ? trustRelaysRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : DEFAULT_TRUST_RELAYS;
  const houseObserverRaw = env.HOUSE_OBSERVER_PUBKEY;
  const houseObserverPubkey =
    houseObserverRaw === undefined
      ? DEFAULT_HOUSE_OBSERVER
      : houseObserverRaw.length === 0
        ? undefined
        : houseObserverRaw;
  if (houseObserverPubkey !== undefined && !/^[0-9a-f]{64}$/.test(houseObserverPubkey)) {
    throw new Error("config: HOUSE_OBSERVER_PUBKEY must be 64 lowercase hex chars when set");
  }

  // Trust backend selection (ADR 0017), mirroring SEARCH_PROVIDER. `fixture` is
  // a deterministic, network-free provider for CI + the staging seed harness.
  const trustProviderRaw = withDefault(env, "TRUST_PROVIDER", "brainstorm");
  if (!KNOWN_TRUST_PROVIDERS.includes(trustProviderRaw as TrustProviderName)) {
    throw new Error(
      `config: TRUST_PROVIDER must be one of ${KNOWN_TRUST_PROVIDERS.join(", ")}; got ${JSON.stringify(trustProviderRaw)}`,
    );
  }
  const trustProvider = trustProviderRaw as TrustProviderName;

  let trustFixture: FixtureSpec | undefined;
  if (trustProvider === "fixture") {
    const raw = env.TRUST_FIXTURE;
    if (raw === undefined || raw.length === 0) {
      throw new Error("config: TRUST_FIXTURE (JSON) is required when TRUST_PROVIDER=fixture");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("config: TRUST_FIXTURE must be valid JSON");
    }
    const weights = (parsed as { weights?: unknown } | null)?.weights;
    if (typeof parsed !== "object" || parsed === null || typeof weights !== "object" || weights === null) {
      throw new Error("config: TRUST_FIXTURE must be an object with a 'weights' map");
    }
    trustFixture = parsed as FixtureSpec;
  }

  return {
    port,
    strfryUrl: withDefault(env, "STRFRY_URL", "ws://localhost:7777"),
    dcoslRelayUrl,
    propagateWrites,
    profileRelays,
    trustProvider,
    brainstormApiUrl: withDefault(env, "BRAINSTORM_API_URL", "https://brainstormserver.nosfabrica.com"),
    trustRelays,
    trustFixture,
    houseObserverPubkey,
    personalizeMinFollows,
    curatorThreshold,
    verifiedAuthorMinCurators,
    searchTrustBlend,
    foryouMinAvg,
    foryouMinRatings,
    foryouBooks,
    foryouCandidateRaters,
    neo4jBoltUrl: withDefault(env, "NEO4J_BOLT_URL", "bolt://localhost:7687"),
    neo4jUser: withDefault(env, "NEO4J_USER", "neo4j"),
    neo4jPassword,
    tapestryApiUrl: withDefault(env, "TAPESTRY_API_URL", "http://localhost:8080"),
    searchUrl: withDefault(env, "SEARCH_URL", "http://localhost:7700"),
    searchApiKey,
    searchProvider,
    databaseUrl,
    backupEncryptionKey,
    publicOrigin: withDefault(env, "PUBLIC_ORIGIN", "http://localhost:5181"),
    librarianPubkey,
  };
}
