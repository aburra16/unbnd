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
};

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

  return {
    port,
    strfryUrl: withDefault(env, "STRFRY_URL", "ws://localhost:7777"),
    neo4jBoltUrl: withDefault(env, "NEO4J_BOLT_URL", "bolt://localhost:7687"),
    neo4jUser: withDefault(env, "NEO4J_USER", "neo4j"),
    neo4jPassword,
    tapestryApiUrl: withDefault(env, "TAPESTRY_API_URL", "http://localhost:8080"),
    searchUrl: withDefault(env, "SEARCH_URL", "http://localhost:7700"),
    searchApiKey,
    searchProvider,
    databaseUrl,
    backupEncryptionKey,
  };
}
