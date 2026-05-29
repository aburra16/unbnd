// Env-var validation per ADR 0002.

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
};

const DEFAULT_PROFILE_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://nos.lol",
  "wss://relay.nostr.band",
];

const KNOWN_PROVIDERS: readonly Config["searchProvider"][] = ["meili", "vespa"];

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

  return {
    port,
    strfryUrl: withDefault(env, "STRFRY_URL", "ws://localhost:7777"),
    dcoslRelayUrl,
    propagateWrites,
    profileRelays,
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
