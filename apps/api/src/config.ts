// Env-var validation per ADR 0002.
// Stub: every accessor throws until the Implementer wires it up.

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
};

export function loadConfig(_env: NodeJS.ProcessEnv = process.env): Config {
  throw new Error("loadConfig not implemented");
}
